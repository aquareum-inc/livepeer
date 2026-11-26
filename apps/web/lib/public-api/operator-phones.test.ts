import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { sql } from "@livepeer/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST as mcp } from "../../app/api/mcp/route";
import { alerts } from "../alerts";
import { everythingKept, rowsOf, testDatabase, useTestDatabase } from "../data/testing";
import { roundStatus, runAlertRound } from "../alerts/round";
import { seal } from "../auth/seal";
import { SESSION_COOKIE } from "../auth/session";
import { GET as route } from "../../app/api/v1/[...path]/route";
import { devices } from "../devices";
import { operatorAudit, operatorDevices } from "../operator-devices";
import { operators } from "../operators";
import { confirmMessage, inputHash, unlockMessage } from "../operator-devices/proof";
import { MAX_FAILED_PROOFS } from "../operator-devices/sessions";
import { TEST_CHALLENGE, TEST_VERIFIER, testPhone, type TestPhone } from "../operator-devices/testing";
import { OPEN_TO_OPERATOR_DEVICES } from "./dispatch";
import { OPERATIONS, type Operation } from "./operations";

/**
 * The rules for an operator's phone, tested through the API route itself: the real `authenticate()`, the
 * real dispatcher and file stores, against a mock-only instance. These are the tests section 18.6 of
 * docs/mobile/plan.md asks of the server.
 */
const dir = mkdtempSync(path.join(tmpdir(), "livepeer-operator-phones-"));
const configFile = path.join(dir, "instance.config.json");
const sam = { userId: "usr_demo_sam", name: "Sam Whitfield", email: "sam@example.test", role: "operator" as const };

const firebase = { projectId: "livepeer-test", appId: "1:1234567890:android:0a1b2c3d4e5f", apiKey: "AIzaSyTestTestTestTestTestTestTestTest", senderId: "1234567890" };

function configure(surfaces: { mobile: boolean; mobileConsole: boolean; api?: boolean }) {
  writeFileSync(configFile, JSON.stringify({ name: "Test", surfaces: { app: true, console: true, api: surfaces.api ?? true, mcp: true, mobile: surfaces.mobile, mobileConsole: surfaces.mobileConsole }, mobile: { ios: { bundleId: "org.livepeer.app.dev" }, android: { applicationId: "org.livepeer.app.dev", firebase } } }));
  // The config is re-read when the file's time changes; make sure it does within one test.
  const next = new Date(statSync(configFile).mtimeMs + 2000 * (configure.count += 1));
  utimesSync(configFile, next, next);
}
configure.count = 0;

useTestDatabase();

beforeAll(async () => {
  vi.stubEnv("INSTANCE_CONFIG", configFile);
  vi.stubEnv("MOCK_ONLY", "1");
  vi.stubEnv("SESSION_SECRET", "a-session-secret-for-the-operator-phone-tests");
  vi.stubEnv("OPERATOR_API_TOKEN", "");
  configure({ mobile: true, mobileConsole: true });
});
// Sam is on the team, as the identity provider's operator: a phone's console works only for someone who is.
beforeEach(() => operators().signIn(sam, true));
afterAll(async () => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

interface Answer {
  status: number;
  code: string | undefined;
  body: unknown;
  text: string;
}

async function call(operation: Operation | string, options: { token?: string; input?: Record<string, unknown>; proof?: string; query?: string; cookie?: string } = {}): Promise<Answer> {
  const found = typeof operation === "string" ? OPERATIONS.find((entry) => entry.name === operation)! : operation;
  const input = { ...options.input };
  const segments = found.path.split("/").filter(Boolean).map((part) => {
    if (!part.startsWith("{")) return part;
    const name = part.slice(1, -1);
    const value = String(input[name] ?? "x");
    delete input[name];
    return value;
  });
  const takesBody = found.method === "POST" || found.method === "PUT" || found.method === "PATCH";
  const search = takesBody ? (options.query ?? "") : new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])).toString();
  const request = new NextRequest(`http://localhost/api/v1/${segments.join("/")}${search ? `?${search}` : ""}`, {
    method: found.method,
    headers: { ...(options.token ? { authorization: `Bearer ${options.token}` } : {}), ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.proof ? { "x-operator-proof": options.proof } : {}), ...(takesBody ? { "content-type": "application/json" } : {}) },
    ...(takesBody ? { body: JSON.stringify(input) } : {}),
  });
  const response = await route(request, { params: Promise.resolve({ path: segments }) });
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;
  return { status: response.status, code: (body as { error?: { code?: string } } | null)?.error?.code, body, text };
}

/** Something for every required input, so a refusal is about who is asking and not about what was left out. */
function filled(operation: Operation): Record<string, unknown> {
  const schema = operation.input as { required?: string[]; properties?: Record<string, { enum?: unknown[]; type?: unknown }> };
  return Object.fromEntries((schema.required ?? []).map((key) => [key, schema.properties?.[key]?.enum?.[0] ?? (schema.properties?.[key]?.type === "number" ? 1 : "x")]));
}

/** A phone enrolled for the console, as the app would hold it. */
async function enrol(identity: typeof sam = sam): Promise<{ token: string; id: string; phone: TestPhone }> {
  const phone = testPhone();
  const code = (await operatorDevices().issueCode({ identity, challenge: TEST_CHALLENGE, platform: "ios" }))!;
  const issued = (await operatorDevices().redeemCode({ code, verifier: TEST_VERIFIER, deviceName: "Sam's iPhone", platform: "ios", publicKey: phone.rawPublicKey }))!;
  return { token: issued.token, id: issued.device.id, phone };
}

async function unlock(device: { token: string; phone: TestPhone }): Promise<Answer> {
  const { nonce } = (await call("create_operator_challenge", { token: device.token, input: { purpose: "unlock" } })).body as { nonce: string };
  return call("unlock_operator_device_session", { token: device.token, input: { nonce, signature: device.phone.sign(unlockMessage(nonce)) } });
}

/** Asks for a nonce for one change and signs it, as the app does after a face or fingerprint. */
async function proofFor(device: { token: string; phone: TestPhone }, operation: string, input: Record<string, unknown>, signer: TestPhone = device.phone): Promise<string> {
  const hash = inputHash(input);
  const { nonce } = (await call("create_operator_challenge", { token: device.token, input: { purpose: operation, input_hash: hash } })).body as { nonce: string };
  return `${nonce}.${signer.sign(confirmMessage(nonce, operation, hash))}`;
}

const lastAudit = async () => (await operatorAudit().list(1))[0];
const operatorOperations = OPERATIONS.filter((operation) => operation.operator);

describe("a user's device session", () => {
  it("is refused every operator operation with 403, even when the provider marks the person an operator", async () => {
    const code = await devices().issueCode({ identity: sam, builderKey: null, challenge: TEST_CHALLENGE, platform: "ios" });
    const { token } = (await devices().redeemCode({ code, verifier: TEST_VERIFIER, deviceName: "Sam's iPhone", platform: "ios" }))!;
    expect(token.startsWith("aqd_")).toBe(true);
    expect(operatorOperations.length).toBeGreaterThan(15);
    for (const operation of operatorOperations) {
      const answer = await call(operation, { token, input: filled(operation) });
      expect(answer.status, operation.name).toBe(403);
    }
    // It knows the person is an operator, so the app can offer the console. That is all it knows.
    expect((await call("get_me", { token })).body).toMatchObject({ id: "usr_demo_sam", role: "operator" });
    // And it is no use where the console's own session is asked for.
    expect((await call("create_operator_challenge", { token, input: { purpose: "unlock" } })).code).toBe("operator_device_required");
    expect((await call("delete_operator_device_session", { token })).code).toBe("operator_device_required");
  });
});

describe("an operator device session", () => {
  it("is refused every operator operation not marked for phones with 403 web_only, unlocked or not, and each refusal is written down", async () => {
    const device = await enrol();
    expect((await unlock(device)).status).toBe(200);
    const unmarked = operatorOperations.filter((operation) => !operation.mobile);
    expect(unmarked.map((operation) => operation.name)).toEqual(expect.arrayContaining(["operator_top_up_user", "operator_assign_plan", "operator_list_keys", "operator_create_grant", "operator_set_capability", "operator_list_devices", "operator_revoke_device", "operator_revoke_all_devices", "operator_list_audit"]));
    for (const operation of unmarked) {
      const answer = await call(operation, { token: device.token, input: filled(operation), proof: "nonce.signature" });
      expect([answer.status, answer.code], operation.name).toEqual([403, "web_only"]);
      expect(await lastAudit(), operation.name).toMatchObject({ event: "refused", operation: operation.name, detail: "web_only", device_id: device.id, user_id: "usr_demo_sam" });
    }
    // None of them ran: the phones are all still enrolled.
    expect((await operatorDevices().list()).some((entry) => entry.id === device.id)).toBe(true);
  });

  it("is refused every user operation, so it can never run a job or spend credit", async () => {
    const device = await enrol();
    await unlock(device);
    const userOperations = OPERATIONS.filter((operation) => !operation.operator && !OPEN_TO_OPERATOR_DEVICES.includes(operation.name));
    expect(userOperations.map((operation) => operation.name)).toEqual(expect.arrayContaining(["create_generation", "run_capability", "create_conversation", "open_session", "delete_account", "list_devices", "create_device_session"]));
    for (const operation of userOperations) {
      const answer = await call(operation, { token: device.token, input: filled(operation) });
      expect([answer.status, answer.code], operation.name).toEqual([403, "operator_session"]);
    }
    expect(await lastAudit()).toMatchObject({ event: "refused", detail: "operator_session" });
    expect([...OPEN_TO_OPERATOR_DEVICES].sort()).toEqual(["create_operator_challenge", "delete_operator_device_session", "get_instance", "get_me", "unlock_operator_device_session"]);
    expect((await call("get_instance", { token: device.token })).body).toMatchObject({ surfaces: { console: true, mobile_console: true } });
    expect((await call("get_me", { token: device.token })).body).toMatchObject({ id: "usr_demo_sam", role: "operator" });
  });

  it("can't read while locked (401 locked), and can once it has unlocked with the phone's signature", async () => {
    const device = await enrol();
    const reads = OPERATIONS.filter((operation) => operation.mobile === "read");
    for (const operation of reads) {
      const answer = await call(operation, { token: device.token });
      expect([answer.status, answer.code], operation.name).toEqual([401, "locked"]);
    }
    expect(await lastAudit()).toMatchObject({ event: "refused", detail: "locked", device_id: device.id });

    const opened = await unlock(device);
    expect(opened.body).toEqual({ unlocked_until: expect.any(String) });
    expect(await lastAudit()).toMatchObject({ event: "unlock", device_id: device.id });
    for (const operation of reads) expect((await call(operation, { token: device.token })).status, operation.name).toBe(200);
  });

  it("answers the phone's reads without a token, a key or a builder key in them", async () => {
    const device = await enrol();
    await unlock(device);
    for (const operation of OPERATIONS.filter((entry) => entry.mobile === "read")) {
      const { text } = await call(operation, { token: device.token });
      expect(text, operation.name).not.toMatch(/aqo_|aqd_|lpk_|token|secret|builder_?key|public_?key|private/i);
    }
    const { text } = await call("get_me", { token: device.token });
    expect(text).not.toMatch(/aqo_|aqd_|lpk_|builder_?key|public_?key/i);
  });

  it("needs a proof for every change: an unlocked session is not enough", async () => {
    const device = await enrol();
    await unlock(device);
    const input = { id: "usr_demo_priya", status: "paused" };
    const answer = await call("operator_set_user_status", { token: device.token, input });
    expect([answer.status, answer.code]).toEqual([401, "proof_required"]);
    expect(await lastAudit()).toMatchObject({ event: "refused", operation: "operator_set_user_status", target: "usr_demo_priya", detail: "proof_required" });
  });

  it("makes a change with a proof for exactly it, once, and writes it down", async () => {
    const device = await enrol();
    const input = { id: "usr_demo_priya", status: "paused" };
    const proof = await proofFor(device, "operator_set_user_status", input);
    // No unlock is needed for a change: the proof is the stronger check.
    const done = await call("operator_set_user_status", { token: device.token, input, proof });
    expect([done.status, done.body]).toEqual([200, { ok: true }]);
    expect(await lastAudit()).toMatchObject({ event: "change", operation: "operator_set_user_status", target: "usr_demo_priya", detail: "paused", device_id: device.id, device_name: "Sam's iPhone", user_name: "Sam Whitfield" });

    const again = await call("operator_set_user_status", { token: device.token, input, proof });
    expect([again.status, again.code]).toEqual([401, "proof_required"]);
    expect(await lastAudit()).toMatchObject({ event: "refused", operation: "operator_set_user_status", detail: "unknown or used nonce" });
  });

  it("refuses a proof made for another operation, for other input, or signed by another key", async () => {
    const device = await enrol();
    const input = { id: "usr_demo_priya", status: "paused" };

    const forReport = await proofFor(device, "operator_resolve_report", { id: "usr_demo_priya", outcome: "hidden" });
    expect((await call("operator_set_user_status", { token: device.token, input, proof: forReport })).code).toBe("proof_required");
    expect(await lastAudit()).toMatchObject({ event: "refused", detail: "made for another operation or input" });

    const forResume = await proofFor(device, "operator_set_user_status", { id: "usr_demo_priya", status: "active" });
    expect((await call("operator_set_user_status", { token: device.token, input, proof: forResume })).code).toBe("proof_required");
    const forSomeoneElse = await proofFor(device, "operator_set_user_status", { id: "usr_demo_adam", status: "paused" });
    expect((await call("operator_set_user_status", { token: device.token, input, proof: forSomeoneElse })).code).toBe("proof_required");

    const otherKey = await proofFor(device, "operator_set_user_status", input, testPhone());
    expect((await call("operator_set_user_status", { token: device.token, input, proof: otherKey })).code).toBe("proof_required");
    expect(await lastAudit()).toMatchObject({ event: "refused", detail: "signature isn't this phone's" });

    // Another enrolled phone's proof is no use to this one.
    const other = await enrol();
    const theirs = await proofFor(other, "operator_set_user_status", input);
    expect((await call("operator_set_user_status", { token: device.token, input, proof: theirs })).code).toBe("proof_required");
  });

  it("ignores the address of a change, so nothing unsigned can ride along with a signed body", async () => {
    const device = await enrol();
    const input = { id: "usr_demo_priya", status: "active" };
    const proof = await proofFor(device, "operator_set_user_status", input);
    const done = await call("operator_set_user_status", { token: device.token, input, proof, query: "status=paused&application_id=other" });
    expect(done.status).toBe(200);
    expect(await lastAudit()).toMatchObject({ event: "change", detail: "active" });
  });

  it("only gives a nonce for unlocking or for a change a phone may make", async () => {
    const device = await enrol();
    const ask = (input: Record<string, unknown>) => call("create_operator_challenge", { token: device.token, input });
    expect((await ask({ purpose: "operator_top_up_user", input_hash: inputHash({}) })).status).toBe(400);
    expect((await ask({ purpose: "operator_list_jobs", input_hash: inputHash({}) })).status).toBe(400);
    expect((await ask({ purpose: "operator_resolve_report" })).status).toBe(400);
    expect((await ask({ purpose: "operator_resolve_report", input_hash: "short" })).status).toBe(400);
    expect((await ask({ purpose: "operator_resolve_report", input_hash: inputHash({ id: "rep_1", outcome: "hidden" }) })).body).toEqual({ nonce: expect.stringMatching(/^[\w-]{43}$/), expires_at: expect.any(String) });
  });

  it("is revoked at five refused proofs in a row, and then nothing works", async () => {
    const device = await enrol();
    const input = { id: "usr_demo_priya", status: "paused" };
    for (let attempt = 1; attempt <= MAX_FAILED_PROOFS; attempt += 1) {
      const answer = await call("operator_set_user_status", { token: device.token, input, proof: `nonce${attempt}.c2lnbmF0dXJlLXRoYXQtaXMtbm90LW9uZQ` });
      expect([answer.status, answer.code], `attempt ${attempt}`).toEqual([401, "proof_required"]);
    }
    expect(await lastAudit()).toMatchObject({ event: "revoked", device_id: device.id, detail: `${MAX_FAILED_PROOFS} refused proofs in a row` });
    const after = await call("get_me", { token: device.token });
    expect([after.status, after.code]).toEqual([401, "signed_out"]);
  });

  it("stops on the request after it is revoked from the web console, and the person's user app carries on", async () => {
    const device = await enrol();
    await unlock(device);
    const code = await devices().issueCode({ identity: sam, builderKey: null, challenge: TEST_CHALLENGE, platform: "ios" });
    const app = (await devices().redeemCode({ code, verifier: TEST_VERIFIER, deviceName: "Sam's iPhone", platform: "ios" }))!;
    expect((await call("operator_status", { token: device.token })).status).toBe(200);

    expect(await operatorDevices().revoke(device.id, { userId: "usr_demo_ops", name: "Ola Operator", deviceId: null, deviceName: null })).toBe(true);
    expect(await lastAudit()).toMatchObject({ event: "revoked", user_name: "Ola Operator", device_id: device.id, detail: "revoked from the web console" });
    const after = await call("operator_status", { token: device.token });
    expect([after.status, after.code]).toEqual([401, "signed_out"]);
    expect((await call("get_me", { token: app.token })).status).toBe(200);
  });

  it("signs itself out, and suspending the person ends their console sessions too", async () => {
    const device = await enrol();
    expect((await call("delete_operator_device_session", { token: device.token })).body).toEqual({ deleted: true });
    expect(await lastAudit()).toMatchObject({ event: "sign_out", device_id: device.id });
    expect((await call("get_me", { token: device.token })).status).toBe(401);

    const acting = await enrol();
    const suspended = await enrol({ ...sam, userId: "usr_demo_priya", name: "Priya Raman" });
    const input = { id: "usr_demo_priya", status: "paused" };
    expect((await call("operator_set_user_status", { token: acting.token, input, proof: await proofFor(acting, "operator_set_user_status", input) })).status).toBe(200);
    expect((await call("get_me", { token: suspended.token })).status).toBe(401);
    expect(await operatorAudit().list(5)).toContainEqual(expect.objectContaining({ event: "revoked", device_id: suspended.id, detail: "suspended" }));
  });

  it("can't be used over MCP", async () => {
    const device = await enrol();
    await unlock(device);
    const response = await mcp(new NextRequest("http://localhost/api/mcp", { method: "POST", headers: { authorization: `Bearer ${device.token}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "operator_list_keys", arguments: {} } }) }));
    expect(response.status).toBe(401);
  });

  it("collects an operator sign-in over the API, with the phone's key, once", async () => {
    const phone = testPhone();
    const code = (await operatorDevices().issueCode({ identity: sam, challenge: TEST_CHALLENGE, platform: "ios" }))!;
    const input = { code, verifier: TEST_VERIFIER, platform: "ios", device_name: "Sam's iPhone", public_key: phone.rawPublicKey };
    const issued = await call("create_operator_device_session", { input });
    expect(issued.body).toMatchObject({ token: expect.stringMatching(/^aqo_/), device: { user_name: "Sam Whitfield", name: "Sam's iPhone", platform: "ios" } });
    expect(await lastAudit()).toMatchObject({ event: "sign_in", user_id: "usr_demo_sam" });
    expect((await call("create_operator_device_session", { input })).code).toBe("sign_in_expired");
  });
});

describe("alerts on an operator's phone", () => {
  const PUSH = "5a".repeat(32);
  /** What mock-only mode wrote down instead of sending, oldest first. */
  const outbox = async () => (await rowsOf<{ seq: number; platform: string; payload: { aps?: { alert?: { body?: string } } } }>("push_outbox")).sort((first, second) => first.seq - second.seq);
  const bodies = async () => (await outbox()).map((entry) => entry.payload.aps?.alert?.body);
  /** Turns alerts on as the app does: a proof for exactly these kinds and this push token. */
  const turnOn = async (device: { token: string; phone: TestPhone }, kinds: string[], pushToken = PUSH) => {
    const input = { kinds, push_token: pushToken, environment: "development" };
    return call("operator_set_alerts", { token: device.token, input, proof: await proofFor(device, "operator_set_alerts", input) });
  };

  it("are off until the phone turns them on, and the instance says whether it can send any", async () => {
    const device = await enrol();
    await unlock(device);
    expect((await call("operator_get_alerts", { token: device.token })).body).toEqual({
      offered: true,
      state: "off",
      kinds: [
        { kind: "engine_not_ready", label: "The engine stops being ready", on: false },
        { kind: "jobs_failing", label: "Jobs are failing", on: false },
        { kind: "reports_waiting", label: "A report is waiting", on: false },
      ],
      until: null,
      last_alert_at: null,
    });
  });

  it("are turned on, changed and turned off only with a proof for exactly that, and it is written down without the push token", async () => {
    const device = await enrol();
    await unlock(device);
    const input = { kinds: ["engine_not_ready", "reports_waiting"], push_token: PUSH, environment: "development" };

    // An unlocked session is not enough, and neither is the token alone.
    const bare = await call("operator_set_alerts", { token: device.token, input });
    expect([bare.status, bare.code]).toEqual([401, "proof_required"]);
    // A proof for the same kinds at another push token is no use: alerts can't be pointed elsewhere.
    const elsewhere = await proofFor(device, "operator_set_alerts", { ...input, push_token: "6b".repeat(32) });
    expect((await call("operator_set_alerts", { token: device.token, input, proof: elsewhere })).code).toBe("proof_required");
    // Nor is a proof for turning them off.
    const off = await proofFor(device, "operator_set_alerts", { kinds: [] });
    expect((await call("operator_set_alerts", { token: device.token, input, proof: off })).code).toBe("proof_required");
    expect((await call("operator_get_alerts", { token: device.token })).body).toMatchObject({ state: "off" });

    const on = await turnOn(device, input.kinds);
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ offered: true, state: "on", kinds: [{ kind: "engine_not_ready", on: true }, { kind: "jobs_failing", on: false }, { kind: "reports_waiting", on: true }], until: expect.any(String) });
    expect(await lastAudit()).toMatchObject({ event: "change", operation: "operator_set_alerts", detail: "alerts on: engine_not_ready, reports_waiting", device_id: device.id });
    expect((await call("operator_get_alerts", { token: device.token })).body).toEqual(on.body);
    expect((await operatorDevices().list()).find((entry) => entry.id === device.id)).toMatchObject({ alerts: "on", signed_out: false });

    const done = await call("operator_set_alerts", { token: device.token, input: { kinds: [] }, proof: await proofFor(device, "operator_set_alerts", { kinds: [] }) });
    expect(done.body).toMatchObject({ state: "off", until: null });
    expect(await lastAudit()).toMatchObject({ event: "change", operation: "operator_set_alerts", detail: "alerts off" });
    expect(await operatorDevices().alertTargets(null, { only: [device.id] })).toEqual([]);
  });

  it("are the only change whose record speaks of alerts: a stray field on another change can't put words in the log", async () => {
    const device = await enrol();
    const input = { id: "usr_demo_priya", status: "active", kinds: ["nothing happened here"] };
    const done = await call("operator_set_user_status", { token: device.token, input, proof: await proofFor(device, "operator_set_user_status", input) });
    expect(done.status).toBe(200);
    expect(await lastAudit()).toMatchObject({ event: "change", operation: "operator_set_user_status", target: "usr_demo_priya", detail: "active" });
  });

  it("never answer with, log or store in the clear the push token", async () => {
    const device = await enrol();
    await unlock(device);
    const on = await turnOn(device, ["reports_waiting"]);
    const read = await call("operator_get_alerts", { token: device.token });
    const test = await call("operator_test_alert", { token: device.token, proof: await proofFor(device, "operator_test_alert", {}) });
    expect(test.body).toEqual({ ok: true });
    await alerts().settled();
    for (const answer of [on, read, test]) expect(answer.text).not.toMatch(/token|secret|private|public_?key/i);
    expect(await everythingKept()).not.toContain(PUSH);
    // And the web's list of phones says only where alerts stand.
    expect(JSON.stringify(await operatorDevices().list())).not.toContain(PUSH);
  });

  it("refuse kinds that don't exist, a push token that isn't one, and anything but a list", async () => {
    const device = await enrol();
    const attempt = async (input: Record<string, unknown>) => call("operator_set_alerts", { token: device.token, input, proof: await proofFor(device, "operator_set_alerts", input) });
    expect((await attempt({ kinds: ["engine_not_ready", "everything"], push_token: PUSH })).status).toBe(400);
    expect((await attempt({ kinds: ["engine_not_ready", "engine_not_ready"], push_token: PUSH })).status).toBe(400);
    expect((await attempt({ kinds: "engine_not_ready", push_token: PUSH })).status).toBe(400);
    expect((await attempt({ kinds: ["engine_not_ready"] })).status).toBe(400);
    expect((await attempt({ kinds: ["engine_not_ready"], push_token: "https://example.test/collect" })).status).toBe(400);
    expect((await call("operator_get_alerts", { token: device.token })).code).toBe("locked");
    expect(await operatorDevices().alertTargets(null, { only: [device.id] })).toEqual([]);
  });

  it("belong to the console's own session: a user's phone, the web console and the operator API token are told so", async () => {
    const code = await devices().issueCode({ identity: sam, builderKey: null, challenge: TEST_CHALLENGE, platform: "ios" });
    const app = (await devices().redeemCode({ code, verifier: TEST_VERIFIER, deviceName: "Sam's iPhone", platform: "ios" }))!;
    const cookie = `${SESSION_COOKIE}=${seal({ ...sam, builderKey: null, expiresAt: Math.floor(Date.now() / 1000) + 3600 }, "a-session-secret-for-the-operator-phone-tests")}`;
    vi.stubEnv("OPERATOR_API_TOKEN", "an-operator-api-token-for-this-test");
    for (const who of [{ token: app.token }, { cookie }, { token: "an-operator-api-token-for-this-test" }]) {
      for (const [name, input] of [["operator_get_alerts", {}], ["operator_set_alerts", { kinds: ["engine_not_ready"], push_token: PUSH }], ["operator_test_alert", {}]] as const) {
        const answer = await call(name, { ...who, input });
        expect([answer.status, answer.code], `${name} ${Object.keys(who)[0]}`).toEqual([403, "operator_device_required"]);
      }
    }
    vi.stubEnv("OPERATOR_API_TOKEN", "");
    // The web console does see where each phone's alerts stand.
    expect((await call("operator_list_devices", { cookie })).status).toBe(200);
  });

  it("tell the phone when a report is filed, and every other phone when one is added", async () => {
    const device = await enrol();
    await turnOn(device, ["reports_waiting"]);
    const before = (await bodies()).length;

    // An ordinary user reports a shared character from the app.
    const code = await devices().issueCode({ identity: { userId: "usr_demo_adam", name: "Adam Soffer", email: "adam@example.test", role: "user" }, builderKey: null, challenge: TEST_CHALLENGE, platform: "ios" });
    const adam = (await devices().redeemCode({ code, verifier: TEST_VERIFIER, deviceName: "Adam's iPhone", platform: "ios" }))!;
    const shared = ((await call("list_characters", { token: adam.token })).body as Array<{ slug: string; mine: boolean }>).filter((entry) => !entry.mine);
    const waiting = async () => (await rowsOf<{ state: string }>("character_reports")).filter((entry) => entry.state === "open").length;
    expect((await call("report_character", { token: adam.token, input: { slug: shared[0]!.slug, reason: "spam", note: "selling something" } })).status).toBe(200);
    await alerts().settled();
    const count = await waiting();
    expect((await bodies()).slice(before)).toEqual([count === 1 ? "1 report is waiting" : `${count} reports are waiting`]);

    // Saying more about the same report is not a new report.
    expect((await call("report_character", { token: adam.token, input: { slug: shared[0]!.slug, reason: "other", note: "on second thoughts" } })).status).toBe(200);
    await alerts().settled();
    expect((await bodies()).slice(before)).toHaveLength(1);

    // A second phone enrols through the API: the first is told, in words that name nobody.
    const phone = testPhone();
    const pending = (await operatorDevices().issueCode({ identity: sam, challenge: TEST_CHALLENGE, platform: "ios" }))!;
    expect((await call("create_operator_device_session", { input: { code: pending, verifier: TEST_VERIFIER, platform: "ios", device_name: "Sam's other iPhone", public_key: phone.rawPublicKey } })).status).toBe(200);
    await alerts().settled();
    expect((await bodies()).slice(before + 1)).toEqual(["A phone was added to the console"]);
    expect((await operatorAudit().list(1))[0]).toMatchObject({ event: "alert", device_id: device.id, detail: "phone_added: sent" });
  });

  it("send a test only with a proof, and say when alerts are off", async () => {
    const device = await enrol();
    await unlock(device);
    const bare = await call("operator_test_alert", { token: device.token });
    expect([bare.status, bare.code]).toEqual([401, "proof_required"]);
    const off = await call("operator_test_alert", { token: device.token, proof: await proofFor(device, "operator_test_alert", {}) });
    expect([off.status, off.code]).toEqual([409, "alerts_off"]);
    await turnOn(device, ["engine_not_ready"]);
    const before = (await bodies()).length;
    for (let attempt = 0; attempt < 3; attempt += 1) expect((await call("operator_test_alert", { token: device.token, proof: await proofFor(device, "operator_test_alert", {}) })).body).toEqual({ ok: true });
    const fourth = await call("operator_test_alert", { token: device.token, proof: await proofFor(device, "operator_test_alert", {}) });
    expect([fourth.status, fourth.code]).toEqual([429, "rate_limited"]);
    expect((await bodies()).slice(before)).toEqual(["Alerts reach this phone.", "Alerts reach this phone.", "Alerts reach this phone."]);
  });

  it("stop with the phone: revoked from the web, it is sent nothing more", async () => {
    const device = await enrol();
    await turnOn(device, ["engine_not_ready", "jobs_failing", "reports_waiting"]);
    expect(await operatorDevices().alertTargets(null, { only: [device.id] })).toHaveLength(1);
    await operatorDevices().revoke(device.id, { userId: "usr_demo_sam", name: "Sam Whitfield", deviceId: null, deviceName: null });
    expect(await operatorDevices().alertTargets(null, { only: [device.id] })).toEqual([]);
  });

  /** What the instance keeps about its rounds. */
  const round = async () => {
    const [row] = await rowsOf<{ round_claimed_at: Date | null; jobs_read_at: Date | null; engine_down: boolean }>("alert_state");
    const time = (value: Date | null | undefined) => (value ? new Date(value).getTime() : null);
    return { round: { claimedAt: time(row?.round_claimed_at), jobsReadAt: time(row?.jobs_read_at) }, state: { engine: { down: row?.engine_down ?? false } } };
  };
  /** Moves what the instance remembers of its rounds into the past, as if that long had gone by since. */
  const later = async (ms: number) => {
    await testDatabase().execute(sql.raw(`update alert_state set round_claimed_at = round_claimed_at - interval '${ms} milliseconds', jobs_read_at = jobs_read_at - interval '${ms} milliseconds'`));
  };

  it("are watched for by a round of checks that only reads, started by one caller at a time", async () => {
    const device = await enrol();
    await turnOn(device, ["engine_not_ready", "jobs_failing", "reports_waiting"]);
    // Two callers at once, as a timer and a scheduler would be: one round runs.
    expect((await Promise.all([runAlertRound(), runAlertRound()])).sort()).toEqual([false, true]);
    expect(await runAlertRound()).toBe(false);
    const first = (await round()).round;
    expect(first.jobsReadAt).not.toBeNull();

    await later(60_000);
    expect(await runAlertRound()).toBe(true);
    // The mock engine is ready on both checks, so nobody is told it isn't.
    expect((await round()).state.engine.down).toBe(false);
    expect(await bodies()).not.toContain("The engine isn't ready");
    // Recent jobs were read on the first round and are not read again a minute later.
    expect((await round()).round.jobsReadAt).toBe((first.jobsReadAt ?? 0) - 60_000);
    await later(5 * 60_000);
    expect(await runAlertRound()).toBe(true);
    expect((await round()).round.jobsReadAt).toBeGreaterThan((first.jobsReadAt ?? 0) - 60_000);

    expect(await roundStatus()).toMatchObject({ status: "running" });
    // With no round for five minutes, nothing is running the checks. A server that runs them itself and has
    // only just started is given a moment; where a scheduler runs them, there is nothing to wait for.
    expect((await roundStatus(Date.now() + 5 * 60_000)).status).toBe(process.uptime() < 90 ? "starting" : "overdue");
    vi.stubEnv("CRON_SECRET", "a-secret-only-the-scheduler-holds");
    expect((await roundStatus(Date.now() + 5 * 60_000)).status).toBe("overdue");
    vi.stubEnv("CRON_SECRET", "");
  });

  it("send nothing while the console is off on phones, though the round still runs and tidies up", async () => {
    const device = await enrol();
    await turnOn(device, ["reports_waiting"]);
    const before = (await bodies()).length;
    configure({ mobile: true, mobileConsole: false });
    try {
      alerts().reportFiled(9);
      alerts().phoneAdded("opd_someone");
      await alerts().settled();
      await later(10 * 60_000);
      const jobsReadBefore = (await round()).round.jobsReadAt;
      expect(await runAlertRound()).toBe(true);
      expect(await bodies()).toHaveLength(before);
      // Nothing was asked of the engine: recent jobs weren't read.
      expect((await round()).round.jobsReadAt).toBe(jobsReadBefore);
      expect(await roundStatus()).toEqual({ status: "off", lastAt: null });
    } finally {
      configure({ mobile: true, mobileConsole: true });
    }
  });

  it("are run by a scheduler through a route that exists only for the holder of CRON_SECRET", async () => {
    const { GET } = await import("../../app/api/cron/alerts/route");
    const call = (authorization?: string) => GET(new NextRequest("http://localhost/api/cron/alerts", authorization ? { headers: { authorization } } : {}));
    // No secret set: there is no such page, whatever is sent.
    expect((await call("Bearer anything")).status).toBe(404);
    vi.stubEnv("CRON_SECRET", "a-secret-only-the-scheduler-holds");
    try {
      expect((await call()).status).toBe(404);
      expect((await call("Bearer a-secret-somebody-guessed")).status).toBe(404);
      expect((await call("a-secret-only-the-scheduler-holds")).status).toBe(404);
      await later(60_000);
      const first = await call("Bearer a-secret-only-the-scheduler-holds");
      expect([first.status, await first.json()]).toEqual([200, { ran: true }]);
      // The same call tried again, as a scheduler does after a timeout, runs nothing twice.
      expect(await (await call("Bearer a-secret-only-the-scheduler-holds")).json()).toEqual({ ran: false });
    } finally {
      vi.stubEnv("CRON_SECRET", "");
    }
  });

  it("leave the timer unstarted where a scheduler runs the rounds", async () => {
    const { startAlertWatcher } = await import("../alerts/watcher");
    const held = globalThis as { livepeerAlertWatcher?: NodeJS.Timeout };
    vi.stubEnv("CRON_SECRET", "a-secret-only-the-scheduler-holds");
    startAlertWatcher();
    expect(held.livepeerAlertWatcher).toBeUndefined();
    vi.stubEnv("CRON_SECRET", "");
    startAlertWatcher();
    expect(held.livepeerAlertWatcher).toBeDefined();
    clearInterval(held.livepeerAlertWatcher);
    delete held.livepeerAlertWatcher;
  });

  it("the instance says what the Android app starts Firebase with, and nothing that sends", async () => {
    const answer = await call("get_instance");
    expect(answer.body).toMatchObject({ mobile: { android: { application_id: "org.livepeer.app.dev", firebase: { project_id: "livepeer-test", app_id: "1:1234567890:android:0a1b2c3d4e5f", api_key: "AIzaSyTestTestTestTestTestTestTestTest", sender_id: "1234567890" } } } });
    expect(answer.text).not.toMatch(/service_account|private_key|client_email|APNS|p8/i);
  });
});

describe("a phone's role on the team", () => {
  const ines = { userId: "usr_demo_ines", name: "Ines Okafor", email: "ines@example.test", role: "operator" as const };
  const suspend = { id: "usr_demo_priya", status: "paused" };

  it("reads as a viewer and changes nothing, changes what a member may, and stops when its person leaves the team", async () => {
    await operators().add(ines, "viewer", sam.userId);
    const device = await enrol(ines);
    await unlock(device);

    // A viewer reads everything, and is told their role so the app can leave the changes out.
    expect((await call("operator_status", { token: device.token })).body).toMatchObject({ role: "viewer" });
    expect((await call("operator_list_users", { token: device.token })).status).toBe(200);
    // A proof doesn't help: the role is asked first, and the refusal is written down.
    const refused = await call("operator_set_user_status", { token: device.token, input: suspend, proof: await proofFor(device, "operator_set_user_status", suspend) });
    expect([refused.status, refused.code]).toEqual([403, "role"]);
    expect(await lastAudit()).toMatchObject({ event: "refused", user_id: "usr_demo_ines", operation: "operator_set_user_status", detail: "role" });
    // Their own alerts are theirs to read, whatever the role.
    expect((await call("operator_get_alerts", { token: device.token })).status).toBe(200);

    // Made a member, the same phone can, from its next request.
    expect(await operators().setRole(ines.userId, "member")).toBe("done");
    expect((await call("operator_status", { token: device.token })).body).toMatchObject({ role: "member" });
    const done = await call("operator_set_user_status", { token: device.token, input: suspend, proof: await proofFor(device, "operator_set_user_status", suspend) });
    expect([done.status, done.body]).toEqual([200, { ok: true }]);

    // Off the team, the phone is signed out and its session is gone.
    expect(await operators().remove(ines.userId)).toBe("done");
    expect([(await call("operator_status", { token: device.token })).status, (await call("get_me", { token: device.token })).status]).toEqual([401, 401]);
    expect((await operatorDevices().list()).some((phone) => phone.user_id === ines.userId)).toBe(false);
    expect(await lastAudit()).toMatchObject({ event: "revoked", detail: "operator role removed" });
  });

  it("gives the identity provider's operator an owner's reach", async () => {
    const device = await enrol();
    await unlock(device);
    expect((await call("operator_status", { token: device.token })).body).toMatchObject({ role: "owner" });
  });
});

describe("with the console on phones switched off", () => {
  it("refuses an enrolled phone everything with 403 mobile_console_off, enrols no one, and leaves the user app alone", async () => {
    const device = await enrol();
    await unlock(device);
    const code = await devices().issueCode({ identity: sam, builderKey: null, challenge: TEST_CHALLENGE, platform: "ios" });
    const app = (await devices().redeemCode({ code, verifier: TEST_VERIFIER, deviceName: "Sam's iPhone", platform: "ios" }))!;

    configure({ mobile: true, mobileConsole: false });
    for (const name of ["operator_status", "get_me", "get_instance", "create_operator_challenge", "operator_set_user_status"]) {
      const operation = OPERATIONS.find((entry) => entry.name === name)!;
      const answer = await call(operation, { token: device.token, input: filled(operation) });
      expect([answer.status, answer.code], name).toEqual([403, "mobile_console_off"]);
    }
    const pending = (await operatorDevices().issueCode({ identity: sam, challenge: TEST_CHALLENGE, platform: "ios" }))!;
    expect((await call("create_operator_device_session", { input: { code: pending, verifier: TEST_VERIFIER, platform: "ios", public_key: testPhone().rawPublicKey } })).code).toBe("mobile_console_off");
    expect((await call("get_me", { token: app.token })).status).toBe(200);
    expect((await call("get_instance")).body).toMatchObject({ surfaces: { mobile: true, mobile_console: false } });

    // Switched back on, the phone carries on where it was.
    configure({ mobile: true, mobileConsole: true });
    expect((await call("operator_status", { token: device.token })).status).toBe(200);
  });

  it("serves the console on phones alone, with the user app and the API both off", async () => {
    configure({ mobile: false, mobileConsole: true, api: false });
    const device = await enrol();
    expect((await unlock(device)).status).toBe(200);
    expect((await call("operator_status", { token: device.token })).status).toBe(200);
    // A user's device session is still refused, and an API key finds nothing there.
    const code = await devices().issueCode({ identity: sam, builderKey: null, challenge: TEST_CHALLENGE, platform: "ios" });
    const app = (await devices().redeemCode({ code, verifier: TEST_VERIFIER, deviceName: "Sam's iPhone", platform: "ios" }))!;
    expect((await call("get_me", { token: app.token })).code).toBe("mobile_off");
    expect((await call("operator_status", { token: "lpk_an_api_key" })).status).toBe(404);
    configure({ mobile: true, mobileConsole: true });
  });
});

describe("the dispatcher", () => {
  it("is the only place a request reaches an operation's run", async () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const sources = (folder: string): string[] =>
      readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(folder, entry.name);
        if (entry.isDirectory()) return entry.name === "node_modules" || entry.name.startsWith(".") ? [] : sources(full);
        return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
      });
    const callers = sources(root).filter((file) => /\boperation\.run\(|\.operation\.run\(|\]\.run\(/.test(readFileSync(file, "utf8")));
    expect(callers.map((file) => path.relative(root, file))).toEqual(["lib/public-api/dispatch.ts"]);
  });
});

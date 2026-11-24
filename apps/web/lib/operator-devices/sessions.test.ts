import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { memoryStore } = await import("../data/store");
const { auditLog, AUDIT_LIMIT } = await import("./audit");
const { documentAuditStore } = await import("./store");
const { confirmMessage, inputHash, readPublicKey, signed, unlockMessage } = await import("./proof");
const { operatorDeviceSessions, OPERATOR_DEVICE_TOKEN_PREFIX, ABSOLUTE_DAYS, IDLE_DAYS, MAX_FAILED_PROOFS, REQUESTS_PER_MINUTE, UNLOCK_SECONDS } = await import("./sessions");
const { TEST_CHALLENGE, TEST_SECRET, TEST_VERIFIER, emptyAudit, emptyOperatorDevices, testPhone } = await import("./testing");

const sam = { userId: "usr_demo_sam", name: "Sam Whitfield", email: "sam@example.test", role: "operator" as const };
const DAY = 86_400_000;

function setup(start = Date.parse("2026-11-21T09:00:00Z")) {
  const clock = { now: start };
  const store = emptyOperatorDevices();
  const audit = auditLog(emptyAudit(), () => clock.now);
  const sessions = operatorDeviceSessions(store, TEST_SECRET, audit, () => clock.now);
  const phone = testPhone();
  const enrol = async (key = phone.rawPublicKey, identity: typeof sam | (Omit<typeof sam, "role"> & { role: "user" }) = sam) => {
    const code = await sessions.issueCode({ identity, challenge: TEST_CHALLENGE, platform: "ios" });
    return code ? await sessions.redeemCode({ code, verifier: TEST_VERIFIER, deviceName: "Sam's iPhone", platform: "ios", publicKey: key }) : null;
  };
  const events = async () => (await audit.list(100)).map((entry) => `${entry.event}${entry.detail ? `: ${entry.detail}` : ""}`);
  return { clock, store, audit, sessions, phone, enrol, events };
}

/** Enrols a phone and answers with what it would hold. */
async function enrolled() {
  const world = setup();
  const issued = (await world.enrol())!;
  const session = async () => (await world.sessions.find(issued.token))!;
  const proofFor = async (operation: string, input: Record<string, unknown>, phone = world.phone) => {
    const { nonce } = await world.sessions.challenge(await session(), { operation, inputHash: inputHash(input) });
    return `${nonce}.${phone.sign(confirmMessage(nonce, operation, inputHash(input)))}`;
  };
  return { ...world, issued, session, proofFor };
}

describe("operator device keys and proofs", () => {
  it("accepts a P-256 key as iOS or Android exports it, and nothing else", async () => {
    const phone = testPhone();
    expect(readPublicKey(phone.rawPublicKey)).not.toBeNull();
    expect(readPublicKey(phone.spkiPublicKey)).toBe(readPublicKey(phone.rawPublicKey));
    const other = generateKeyPairSync("ec", { namedCurve: "secp384r1" }).publicKey.export({ format: "der", type: "spki" }).toString("base64");
    expect(readPublicKey(other)).toBeNull();
    expect(readPublicKey(generateKeyPairSync("ed25519").publicKey.export({ format: "der", type: "spki" }).toString("base64"))).toBeNull();
    // 65 bytes that start like a point but aren't on the curve.
    expect(readPublicKey(Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString("base64"))).toBeNull();
    expect(readPublicKey("")).toBeNull();
    expect(readPublicKey("not a key")).toBeNull();
  });

  it("verifies a signature for its own message only, and never throws on rubbish", async () => {
    const phone = testPhone();
    const key = readPublicKey(phone.rawPublicKey)!;
    expect(signed(key, unlockMessage("n1"), phone.sign(unlockMessage("n1")))).toBe(true);
    expect(signed(key, unlockMessage("n2"), phone.sign(unlockMessage("n1")))).toBe(false);
    // An unlock signature is never a change's, even for the same nonce.
    expect(signed(key, confirmMessage("n1", "operator_resolve_report", inputHash({})), phone.sign(unlockMessage("n1")))).toBe(false);
    expect(signed(key, unlockMessage("n1"), "AAAAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
    expect(signed(key, unlockMessage("n1"), "")).toBe(false);
    expect(signed("nonsense", unlockMessage("n1"), phone.sign(unlockMessage("n1")))).toBe(false);
  });

  it("hashes an input the same whatever order its keys arrive in, and differently for any other input", async () => {
    expect(inputHash({ id: "rep_1", outcome: "hidden" })).toBe(inputHash({ outcome: "hidden", id: "rep_1" }));
    expect(inputHash({ id: "rep_1", outcome: "hidden" })).not.toBe(inputHash({ id: "rep_1", outcome: "dismissed" }));
    expect(inputHash({ id: "rep_1", outcome: "hidden" })).not.toBe(inputHash({ id: "rep_2", outcome: "hidden" }));
    expect(inputHash({ a: { c: 1, b: [true, null] } })).toBe(inputHash({ a: { b: [true, null], c: 1 } }));
    expect(inputHash({})).toMatch(/^[\w-]{43}$/);
  });
});

describe("operator device sessions", () => {
  it("enrols only an operator, once per sign-in, with a key, and keeps no token or builder key", async () => {
    const { sessions, store, enrol, events } = setup();
    expect(await sessions.issueCode({ identity: { ...sam, role: "user" }, challenge: TEST_CHALLENGE, platform: "ios" })).toBeNull();
    expect(await enrol("not a key")).toBeNull();

    const code = (await sessions.issueCode({ identity: sam, challenge: TEST_CHALLENGE, platform: "ios" }))!;
    const phone = testPhone();
    expect(await sessions.redeemCode({ code, verifier: "someone-else's-verifier-that-does-not-match-at-all", deviceName: "x", platform: "ios", publicKey: phone.rawPublicKey })).toBeNull();
    // The code went with the failed attempt.
    expect(await sessions.redeemCode({ code, verifier: TEST_VERIFIER, deviceName: "x", platform: "ios", publicKey: phone.rawPublicKey })).toBeNull();

    const issued = (await enrol())!;
    expect(issued.token.startsWith(OPERATOR_DEVICE_TOKEN_PREFIX)).toBe(true);
    expect(issued.device).toMatchObject({ user_id: "usr_demo_sam", user_name: "Sam Whitfield", name: "Sam's iPhone", platform: "ios", last_unlocked_at: null });
    expect(Date.parse(issued.device.expires_at) - Date.parse(issued.device.created_at)).toBe(ABSOLUTE_DAYS * DAY);
    const raw = JSON.stringify(store.read());
    expect(raw).not.toContain(issued.token);
    expect(raw).not.toContain("builderKey");
    expect(await sessions.find(issued.token)).toMatchObject({ userId: "usr_demo_sam", unlockedUntil: 0 });
    expect(await sessions.find("aqd_" + issued.token.slice(4))).toBeNull();
    expect(await sessions.find("aqo_wrong")).toBeNull();
    expect(await events()).toEqual(["sign_in"]);
  });

  it("refuses a code collected for another platform or after it expired", async () => {
    const { sessions, clock, phone } = setup();
    const code = (await sessions.issueCode({ identity: sam, challenge: TEST_CHALLENGE, platform: "ios" }))!;
    expect(await sessions.redeemCode({ code, verifier: TEST_VERIFIER, deviceName: "x", platform: "android", publicKey: phone.rawPublicKey })).toBeNull();
    const late = (await sessions.issueCode({ identity: sam, challenge: TEST_CHALLENGE, platform: "ios" }))!;
    clock.now += 61_000;
    expect(await sessions.redeemCode({ code: late, verifier: TEST_VERIFIER, deviceName: "x", platform: "ios", publicKey: phone.rawPublicKey })).toBeNull();
  });

  it("ends after seven days without use, and after thirty days however much it is used", async () => {
    const idle = await enrolled();
    idle.clock.now += IDLE_DAYS * DAY - 1000;
    expect(await idle.sessions.find(idle.issued.token)).not.toBeNull();
    idle.clock.now += IDLE_DAYS * DAY;
    expect(await idle.sessions.find(idle.issued.token)).toBeNull();
    expect(await idle.sessions.list()).toEqual([]);

    const busy = await enrolled();
    for (let day = 1; day < ABSOLUTE_DAYS; day += 1) {
      busy.clock.now += DAY;
      expect(await busy.sessions.find(busy.issued.token), `day ${day}`).not.toBeNull();
    }
    busy.clock.now += DAY;
    expect(await busy.sessions.find(busy.issued.token)).toBeNull();
  });

  it("unlocks for five minutes with the phone's signature over a nonce, once", async () => {
    const { sessions, session, phone, clock, events } = await enrolled();
    const { nonce } = await sessions.challenge(await session(), null);
    const signature = phone.sign(unlockMessage(nonce));
    const opened = (await sessions.unlock(await session(), nonce, signature))!;
    expect(Date.parse(opened.unlocked_until)).toBe(clock.now + UNLOCK_SECONDS * 1000);
    expect(await session()).toMatchObject({ unlockedUntil: clock.now + UNLOCK_SECONDS * 1000, lastUnlockedAt: new Date(clock.now).toISOString() });
    // The same nonce and signature, replayed.
    expect(await sessions.unlock(await session(), nonce, signature)).toBeNull();
    expect(await events()).toEqual(["refused: unknown or used nonce", "unlock", "sign_in"]);
  });

  it("refuses an unlock signed by another key, late, or with a nonce made for a change", async () => {
    const { sessions, session, phone, clock } = await enrolled();
    const first = (await sessions.challenge(await session(), null)).nonce;
    expect(await sessions.unlock(await session(), first, testPhone().sign(unlockMessage(first)))).toBeNull();
    // A refused nonce is spent too.
    expect(await sessions.unlock(await session(), first, phone.sign(unlockMessage(first)))).toBeNull();

    const late = (await sessions.challenge(await session(), null)).nonce;
    clock.now += 61_000;
    expect(await sessions.unlock(await session(), late, phone.sign(unlockMessage(late)))).toBeNull();

    const change = (await sessions.challenge(await session(), { operation: "operator_resolve_report", inputHash: inputHash({ id: "rep_1" }) })).nonce;
    expect(await sessions.unlock(await session(), change, phone.sign(unlockMessage(change)))).toBeNull();
    expect((await session()).unlockedUntil).toBe(0);
  });

  it("accepts a proof once, for exactly its operation and input", async () => {
    const { sessions, session, proofFor } = await enrolled();
    const input = { id: "rep_1", outcome: "hidden" };
    const proof = await proofFor("operator_resolve_report", input);
    expect(await sessions.prove(await session(), "operator_resolve_report", { outcome: "hidden", id: "rep_1" }, proof)).toBe(true);
    expect(await sessions.prove(await session(), "operator_resolve_report", input, proof)).toBe(false);
    expect(await sessions.prove(await session(), "operator_set_user_status", input, await proofFor("operator_resolve_report", input))).toBe(false);
    expect(await sessions.prove(await session(), "operator_resolve_report", { id: "rep_2", outcome: "hidden" }, await proofFor("operator_resolve_report", input))).toBe(false);
    expect(await sessions.prove(await session(), "operator_resolve_report", input, "no-dot")).toBe(false);
    expect(await sessions.prove(await session(), "operator_resolve_report", input, ".signature")).toBe(false);
  });

  it("refuses a proof that expired, was signed by another key, or belongs to another session", async () => {
    const first = await enrolled();
    const input = { id: "usr_1", status: "paused" };
    const late = await first.proofFor("operator_set_user_status", input);
    first.clock.now += 61_000;
    expect(await first.sessions.prove(await first.session(), "operator_set_user_status", input, late)).toBe(false);
    expect(await first.sessions.prove(await first.session(), "operator_set_user_status", input, await first.proofFor("operator_set_user_status", input, testPhone()))).toBe(false);

    // A second phone can't spend a nonce the first was given, even signing it with its own enrolled key.
    const other = (await first.enrol(testPhone().rawPublicKey))!;
    const { nonce } = await first.sessions.challenge(await first.session(), { operation: "operator_set_user_status", inputHash: inputHash(input) });
    const proof = `${nonce}.${first.phone.sign(confirmMessage(nonce, "operator_set_user_status", inputHash(input)))}`;
    expect(await first.sessions.prove((await first.sessions.find(other.token))!, "operator_set_user_status", input, proof)).toBe(false);
    expect(await first.sessions.prove(await first.session(), "operator_set_user_status", input, proof)).toBe(true);
  });

  it("revokes the session at five refused proofs in a row, and a good proof starts the count again", async () => {
    const { sessions, session, proofFor, issued, events } = await enrolled();
    const input = { id: "rep_1", outcome: "hidden" };
    for (let attempt = 1; attempt < MAX_FAILED_PROOFS; attempt += 1) expect(await sessions.prove(await session(), "operator_resolve_report", input, "nonce.signature")).toBe(false);
    expect(await sessions.prove(await session(), "operator_resolve_report", input, await proofFor("operator_resolve_report", input))).toBe(true);
    expect((await session()).failedProofs).toBe(0);

    for (let attempt = 1; attempt < MAX_FAILED_PROOFS; attempt += 1) await sessions.prove(await session(), "operator_resolve_report", input, "nonce.signature");
    expect(await sessions.find(issued.token)).not.toBeNull();
    const last = await session();
    expect(await sessions.prove(last, "operator_resolve_report", input, "nonce.signature")).toBe(false);
    expect(await sessions.find(issued.token)).toBeNull();
    expect((await events())[0]).toBe(`revoked: ${MAX_FAILED_PROOFS} refused proofs in a row`);
    // What it was waiting on went with it.
    expect(await sessions.unlock(last, "nonce", "signature")).toBeNull();
  });

  it("revokes one phone, a person's phones or every phone, effective on the next lookup, and writes each down", async () => {
    const { sessions, enrol, audit } = setup();
    const by = { userId: "usr_demo_ops", name: "Ola Operator", deviceId: null, deviceName: null };
    const first = (await enrol(testPhone().rawPublicKey))!;
    const second = (await enrol(testPhone().rawPublicKey))!;
    expect((await sessions.list()).map((entry) => entry.id).sort()).toEqual([first.device.id, second.device.id].sort());

    expect(await sessions.revoke("opd_missing", by)).toBe(false);
    expect(await sessions.revoke(first.device.id, by)).toBe(true);
    expect(await sessions.find(first.token)).toBeNull();
    expect(await sessions.find(second.token)).not.toBeNull();
    expect((await audit.list(1))[0]).toMatchObject({ event: "revoked", user_name: "Ola Operator", device_id: first.device.id, device_name: "Sam's iPhone", target: "usr_demo_sam" });

    expect(await sessions.revokeUser("usr_someone_else", "suspended")).toBe(0);
    expect(await sessions.revokeUser("usr_demo_sam", "suspended")).toBe(1);
    expect(await sessions.find(second.token)).toBeNull();
    expect((await audit.list(1))[0]).toMatchObject({ event: "revoked", detail: "suspended" });

    await enrol(testPhone().rawPublicKey);
    await enrol(testPhone().rawPublicKey);
    expect(await sessions.revokeAll(by)).toBe(2);
    expect(await sessions.list()).toEqual([]);
  });

  it("lets a phone sign itself out, which ends that session only", async () => {
    const { sessions, session, issued, enrol, events } = await enrolled();
    const other = (await enrol(testPhone().rawPublicKey))!;
    expect(await sessions.end(await session())).toBe(true);
    expect(await sessions.find(issued.token)).toBeNull();
    expect(await sessions.find(other.token)).not.toBeNull();
    expect((await events())[0]).toBe("sign_out");
  });

  it("rotating the session secret ends every operator session", async () => {
    const { store, issued } = await enrolled();
    const rotated = operatorDeviceSessions(store, "t".repeat(32), auditLog(emptyAudit()));
    expect(await rotated.find(issued.token)).toBeNull();
  });

  it("limits how fast one session can ask, by the minute", async () => {
    const { sessions, clock } = setup();
    for (let request = 1; request <= REQUESTS_PER_MINUTE; request += 1) expect(await sessions.allow("opd_a")).toBe(true);
    expect(await sessions.allow("opd_a")).toBe(false);
    expect(await sessions.allow("opd_b")).toBe(true);
    clock.now += 60_000;
    expect(await sessions.allow("opd_a")).toBe(true);
  });

  it("keeps only a handful of nonces waiting per phone", async () => {
    const { sessions, session, store } = await enrolled();
    for (let asked = 0; asked < 20; asked += 1) await sessions.challenge(await session(), null);
    expect(store.read().challenges.length).toBe(8);
  });
});

describe("operator audit log", () => {
  it("lists newest first, holds names and ids only, and drops the oldest past its limit", async () => {
    const clock = { now: Date.parse("2026-11-21T09:00:00Z") };
    const audit = auditLog(emptyAudit(), () => clock.now);
    const actor = { userId: "usr_demo_sam", name: "Sam Whitfield", deviceId: "opd_1", deviceName: "Sam's iPhone" };
    await audit.write("sign_in", actor);
    clock.now += 1000;
    await audit.write("change", actor, { operation: "operator_resolve_report", target: "rep_1", detail: "done" });
    expect(await audit.list(10)).toEqual([
      { id: expect.stringMatching(/^aud_/), at: "2026-11-21T09:00:01.000Z", event: "change", user_id: "usr_demo_sam", user_name: "Sam Whitfield", device_id: "opd_1", device_name: "Sam's iPhone", operation: "operator_resolve_report", target: "rep_1", detail: "done" },
      expect.objectContaining({ event: "sign_in", operation: null, target: null, detail: null }),
    ]);
    const newest = (await audit.list(1))[0]!;
    const full = auditLog(documentAuditStore(memoryStore({ entries: Array.from({ length: AUDIT_LIMIT }, () => newest) })), () => clock.now);
    await full.write("unlock", actor);
    expect((await full.list(AUDIT_LIMIT + 10)).length).toBe(AUDIT_LIMIT);
    expect((await full.list(1))[0]?.event).toBe("unlock");
  });
});

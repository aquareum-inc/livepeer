import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const captured = vi.hoisted(() => ({ clients: [] as Array<{ engine?: { url: string; reader?: string; admin?: string } }> }));
vi.mock("@livepeer/api-client", async (original) => {
  const actual = await original<typeof import("@livepeer/api-client")>();
  return {
    ...actual,
    createOperatorClient: (options: Parameters<typeof actual.createOperatorClient>[0]) => {
      captured.clients.push(options as (typeof captured.clients)[number]);
      return actual.createOperatorClient(options);
    },
  };
});

import { buildOperatorClient, buildReaderClient } from "../operator/client";
import { pushSender, pushSetup } from "./index";

/** A live instance (not mock-only) with made-up credentials, to see what it says it can send to. */
const dir = mkdtempSync(path.join(tmpdir(), "livepeer-push-setup-"));
const configFile = path.join(dir, "instance.config.json");
const firebase = { projectId: "livepeer-test", appId: "1:1234567890:android:0a1b2c3d4e5f", apiKey: "AIzaSyTestTestTestTestTestTestTestTest", senderId: "1234567890" };
let writes = 0;

function configure(mobile: Record<string, unknown>) {
  writeFileSync(configFile, JSON.stringify({ name: "Test", surfaces: { app: true, console: true, api: true, mcp: true, mobile: true, mobileConsole: true }, mobile }));
  const next = new Date(statSync(configFile).mtimeMs + 2000 * (writes += 1));
  utimesSync(configFile, next, next);
}

const p8 = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "pem", type: "pkcs8" });
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" });
const account = (projectId: string) => Buffer.from(JSON.stringify({ type: "service_account", project_id: projectId, client_email: "sender@livepeer-test.iam.gserviceaccount.com", private_key: rsa })).toString("base64");
const credentials = { APNS_KEY: Buffer.from(p8).toString("base64"), APNS_KEY_ID: "ABC123DEFG", APNS_TEAM_ID: "TEAM123456", FCM_SERVICE_ACCOUNT: account("livepeer-test") };
const set = (values: Partial<Record<keyof typeof credentials, string>>) => {
  for (const name of Object.keys(credentials) as Array<keyof typeof credentials>) vi.stubEnv(name, values[name] ?? "");
};

beforeAll(async () => {
  vi.stubEnv("INSTANCE_CONFIG", configFile);
  vi.stubEnv("DATA_DIR", path.join(dir, "data"));
  vi.stubEnv("MOCK_ONLY", "");
  vi.stubEnv("ENGINE_URL", "http://engine.test");
  vi.stubEnv("ENGINE_READER_TOKEN", "a-reader-token");
  vi.stubEnv("ENGINE_ADMIN_TOKEN", "an-admin-token");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("whether the instance can send alerts", () => {
  it("can't, and says alerts aren't set up, with no credentials: that is not a fault", async () => {
    configure({ ios: { bundleId: "org.livepeer.app" }, android: { applicationId: "org.livepeer.app", firebase } });
    set({});
    expect(await pushSetup()).toEqual({ ios: { state: "none", detail: "no APNs key" }, android: { state: "none", detail: "no Firebase service account" } });
    expect([(await pushSender()).offers("ios"), (await pushSender()).offers("android")]).toEqual([false, false]);
  });

  it("can, per platform, with that platform's credentials and its app named in the config", async () => {
    configure({ ios: { bundleId: "org.livepeer.app" }, android: { applicationId: "org.livepeer.app", firebase } });
    set(credentials);
    expect(await pushSetup()).toEqual({ ios: { state: "ready", detail: "key ABC123DEFG for org.livepeer.app" }, android: { state: "ready", detail: "project livepeer-test" } });
    expect([(await pushSender()).offers("ios"), (await pushSender()).offers("android")]).toEqual([true, true]);

    set({ FCM_SERVICE_ACCOUNT: credentials.FCM_SERVICE_ACCOUNT });
    expect([(await pushSender()).offers("ios"), (await pushSender()).offers("android")]).toEqual([false, true]);
  });

  it("says what is wrong when credentials are half set, name no app, or are for another project, and sends nothing there", async () => {
    configure({ android: { applicationId: "org.livepeer.app" } });
    set(credentials);
    expect(await pushSetup()).toEqual({ ios: { state: "problem", detail: "an APNs key is set but mobile.ios.bundleId is not" }, android: { state: "problem", detail: "a service account is set but mobile.android.firebase is not" } });
    expect([(await pushSender()).offers("ios"), (await pushSender()).offers("android")]).toEqual([false, false]);

    configure({ ios: { bundleId: "org.livepeer.app" }, android: { applicationId: "org.livepeer.app", firebase } });
    set({ ...credentials, APNS_TEAM_ID: "", FCM_SERVICE_ACCOUNT: account("someone-elses-project") });
    expect(await pushSetup()).toEqual({ ios: { state: "problem", detail: "APNS_TEAM_ID missing" }, android: { state: "problem", detail: "the service account is for someone-elses-project, the config names livepeer-test" } });
    expect([(await pushSender()).offers("ios"), (await pushSender()).offers("android")]).toEqual([false, false]);
  });

  it("never repeats a credential in what it says", async () => {
    set(credentials);
    expect(JSON.stringify(await pushSetup())).not.toMatch(/BEGIN|PRIVATE|client_email|gserviceaccount/);
  });

  it("only records in mock-only mode, whatever credentials are present", async () => {
    set(credentials);
    vi.stubEnv("MOCK_ONLY", "1");
    expect((await pushSetup()).ios).toEqual({ state: "ready", detail: "recorded, not sent (mock-only mode)" });
    const result = await (await pushSender()).send({ platform: "ios", token: "ab".repeat(32), environment: "production" }, { title: "Test", body: "Alerts reach this phone.", kind: "test", opens: "status", collapse: "console-test", lifeSeconds: 3600, channel: "console_service", urgent: false });
    expect(result).toEqual({ outcome: "sent", detail: null });
    vi.stubEnv("MOCK_ONLY", "");
  });
});

describe("the watcher's client", () => {
  it("holds the reader token and no admin token, unlike the console's", async () => {
    captured.clients.length = 0;
    await buildReaderClient();
    await buildOperatorClient();
    expect(captured.clients.map((options) => options.engine)).toEqual([
      { url: "http://engine.test", reader: "a-reader-token" },
      { url: "http://engine.test", reader: "a-reader-token", admin: "an-admin-token" },
    ]);
  });
});

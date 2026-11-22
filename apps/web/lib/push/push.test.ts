import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { createServer, type Http2Server, type IncomingHttpHeaders, type ServerHttp2Session } from "node:http2";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { memoryStore } from "../data/store";
import { apnsSender } from "./apns";
import { readApnsCredentials, readFcmCredentials } from "./credentials";
import { fcmSender } from "./fcm";
import { OUTBOX_LIMIT, recordingSender, type OutboxContents } from "./recording";
import { validPushToken, type PushNotification, type PushTarget } from "./types";

const notification: PushNotification = { title: "Livepeer", body: "The engine isn't ready", kind: "engine_not_ready", opens: "status", collapse: "console-engine_not_ready", lifeSeconds: 3600, channel: "console_service", urgent: true };
const iphone: PushTarget = { platform: "ios", token: "ab".repeat(32), environment: "production" };
const android: PushTarget = { platform: "android", token: `fcm-${"x".repeat(140)}:APA91b`, environment: "production" };
const noWait = async () => undefined;

const p8 = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const apnsEnv = { APNS_KEY: Buffer.from(p8.privateKey.export({ format: "pem", type: "pkcs8" })).toString("base64"), APNS_KEY_ID: "ABC123DEFG", APNS_TEAM_ID: "TEAM123456" };
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = { type: "service_account", project_id: "livepeer-test", client_email: "sender@livepeer-test.iam.gserviceaccount.com", private_key: rsa.privateKey.export({ format: "pem", type: "pkcs8" }) };
const fcmEnv = { FCM_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(account)).toString("base64") };
const from = (values: Record<string, string>) => (name: string) => values[name];

describe("push credentials", () => {
  it("reads an APNs key, its id and the team id, and nothing when none is given", () => {
    expect(readApnsCredentials(from({}))).toBeNull();
    const read = readApnsCredentials(from(apnsEnv));
    expect(read).toMatchObject({ ok: true, value: { keyId: "ABC123DEFG", teamId: "TEAM123456" } });
  });

  it("says what is wrong with half-set or unreadable APNs credentials, without repeating them", () => {
    const problem = (values: Record<string, string>) => {
      const read = readApnsCredentials(from(values));
      return read && !read.ok ? read.problem : null;
    };
    expect(problem({ APNS_KEY: apnsEnv.APNS_KEY })).toBe("APNS_KEY_ID and APNS_TEAM_ID missing");
    expect(problem({ ...apnsEnv, APNS_KEY_ID: "short" })).toBe("APNS_KEY_ID isn't a 10-character key id");
    expect(problem({ ...apnsEnv, APNS_TEAM_ID: "lowercase1" })).toBe("APNS_TEAM_ID isn't a 10-character team id");
    expect(problem({ ...apnsEnv, APNS_KEY: "-----BEGIN PRIVATE KEY-----" })).toBe("APNS_KEY isn't the .p8 file as base64");
    expect(problem({ ...apnsEnv, APNS_KEY: Buffer.from("not a key").toString("base64") })).toBe("APNS_KEY isn't a private key");
    const wrongCurve = generateKeyPairSync("ec", { namedCurve: "secp384r1" }).privateKey.export({ format: "pem", type: "pkcs8" });
    expect(problem({ ...apnsEnv, APNS_KEY: Buffer.from(wrongCurve).toString("base64") })).toBe("APNS_KEY isn't an APNs authentication key (P-256)");
    expect(problem({ ...apnsEnv, APNS_KEY: Buffer.from(account.private_key).toString("base64") })).toBe("APNS_KEY isn't an APNs authentication key (P-256)");
  });

  it("reads a Firebase service account, and says what is wrong with anything else", () => {
    expect(readFcmCredentials(from({}))).toBeNull();
    expect(readFcmCredentials(from(fcmEnv))).toMatchObject({ ok: true, value: { projectId: "livepeer-test", clientEmail: account.client_email } });
    const problem = (value: string) => {
      const read = readFcmCredentials(from({ FCM_SERVICE_ACCOUNT: value }));
      return read && !read.ok ? read.problem : null;
    };
    expect(problem("{}")).toBe("FCM_SERVICE_ACCOUNT isn't the service account's JSON file as base64");
    expect(problem(Buffer.from("not json").toString("base64"))).toBe("FCM_SERVICE_ACCOUNT isn't JSON");
    expect(problem(Buffer.from(JSON.stringify({ ...account, type: "authorized_user" })).toString("base64"))).toBe("FCM_SERVICE_ACCOUNT isn't a service account file");
    expect(problem(Buffer.from(JSON.stringify({ ...account, private_key: "nope" })).toString("base64"))).toBe("FCM_SERVICE_ACCOUNT's key isn't a private key");
  });

  it("knows what each platform's push token looks like", () => {
    expect(validPushToken("ios", iphone.token)).toBe(true);
    expect(validPushToken("ios", android.token)).toBe(false);
    expect(validPushToken("ios", "ab".repeat(16))).toBe(false);
    expect(validPushToken("android", android.token)).toBe(true);
    expect(validPushToken("android", "short")).toBe(false);
    expect(validPushToken("android", `${"x".repeat(40)} with spaces`)).toBe(false);
    expect(validPushToken("ios", `${"ab".repeat(32)}/../3/device/other`)).toBe(false);
  });
});

/** Apple's push service, stood in for by a local HTTP/2 server that answers what it is told to. */
interface FakeApns {
  url: string;
  requests: Array<{ headers: IncomingHttpHeaders; body: string }>;
  answers: Array<{ status: number; reason?: string }>;
  close(): Promise<void>;
}

async function fakeApns(): Promise<FakeApns> {
  const requests: FakeApns["requests"] = [];
  const answers: FakeApns["answers"] = [];
  const server: Http2Server = createServer();
  // The sender keeps its connection open between sends, so closing the server means closing those too.
  const sessions = new Set<ServerHttp2Session>();
  server.on("session", (session) => {
    sessions.add(session);
    session.on("close", () => sessions.delete(session));
  });
  server.on("stream", (stream, headers) => {
    let body = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => (body += chunk));
    stream.on("end", () => {
      requests.push({ headers, body });
      const answer = answers.shift() ?? { status: 200 };
      stream.respond({ ":status": answer.status });
      stream.end(answer.reason ? JSON.stringify({ reason: answer.reason }) : "");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    requests,
    answers,
    close: () =>
      new Promise((resolve) => {
        for (const session of sessions) session.destroy();
        server.close(() => resolve());
      }),
  };
}

describe("sending to Apple", () => {
  let apple: FakeApns | null = null;
  afterEach(async () => {
    await apple?.close();
    apple = null;
  });

  const sender = (url: string, now = () => Date.parse("2026-11-21T09:00:00Z")) => {
    const read = readApnsCredentials(from(apnsEnv));
    if (!read?.ok) throw new Error("test credentials");
    return apnsSender({ credentials: read.value, topic: "org.livepeer.app.dev", hosts: { production: url, development: url }, now, wait: noWait });
  };

  it("posts the payload to the phone's push token, signed with the publisher's key, with the app, a lifetime and a collapse id", async () => {
    apple = await fakeApns();
    const apns = sender(apple.url);
    expect(apns.offers("ios")).toBe(true);
    expect(apns.offers("android")).toBe(false);
    expect(await apns.send(iphone, notification)).toEqual({ outcome: "sent", detail: null });

    const [request] = apple.requests;
    expect(request?.headers).toMatchObject({
      ":method": "POST",
      ":path": `/3/device/${iphone.token}`,
      "apns-topic": "org.livepeer.app.dev",
      "apns-push-type": "alert",
      "apns-collapse-id": "console-engine_not_ready",
      "apns-expiration": String(Date.parse("2026-11-21T10:00:00Z") / 1000),
    });
    expect(JSON.parse(request?.body ?? "")).toEqual({ aps: { alert: { title: "Livepeer", body: "The engine isn't ready" }, sound: "default", "thread-id": "console", "interruption-level": "time-sensitive" }, kind: "engine_not_ready", opens: "status" });

    // The bearer is a token Apple can check: ES256, the key id, the team id, signed by the .p8 key.
    const [header, claims, signature] = String(request?.headers.authorization).replace(/^bearer /, "").split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: Date.parse("2026-11-21T09:00:00Z") / 1000 });
    expect(verify("sha256", Buffer.from(`${header}.${claims}`), { key: createPublicKey(p8.privateKey), dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("signs once and reuses it, as Apple asks, and signs again when the token has aged", async () => {
    apple = await fakeApns();
    const clock = { now: Date.parse("2026-11-21T09:00:00Z") };
    const apns = sender(apple.url, () => clock.now);
    await apns.send(iphone, notification);
    clock.now += 10 * 60_000;
    await apns.send(iphone, notification);
    clock.now += 45 * 60_000;
    await apns.send(iphone, notification);
    const bearers = apple.requests.map((request) => request.headers.authorization);
    expect(bearers[0]).toBe(bearers[1]);
    expect(bearers[2]).not.toBe(bearers[0]);
  });

  it("calls a push token dead when Apple says the phone no longer has the app, or it was never this app's", async () => {
    apple = await fakeApns();
    apple.answers.push({ status: 410, reason: "Unregistered" }, { status: 400, reason: "BadDeviceToken" }, { status: 400, reason: "DeviceTokenNotForTopic" });
    const apns = sender(apple.url);
    expect(await apns.send(iphone, notification)).toEqual({ outcome: "gone", detail: "Unregistered" });
    expect(await apns.send(iphone, notification)).toEqual({ outcome: "gone", detail: "BadDeviceToken" });
    expect(await apns.send(iphone, notification)).toEqual({ outcome: "gone", detail: "DeviceTokenNotForTopic" });
  });

  it("says the instance's own credentials were refused, and keeps the push token", async () => {
    apple = await fakeApns();
    apple.answers.push({ status: 403, reason: "InvalidProviderToken" });
    expect(await sender(apple.url).send(iphone, notification)).toEqual({ outcome: "refused", detail: "InvalidProviderToken" });
    expect(apple.requests).toHaveLength(1);
  });

  it("signs again once when Apple says its token expired", async () => {
    apple = await fakeApns();
    apple.answers.push({ status: 403, reason: "ExpiredProviderToken" });
    expect(await sender(apple.url).send(iphone, notification)).toEqual({ outcome: "sent", detail: null });
    expect(apple.requests).toHaveLength(2);
  });

  it("tries three times when Apple is busy, then gives up and says so", async () => {
    apple = await fakeApns();
    apple.answers.push({ status: 503, reason: "ServiceUnavailable" }, { status: 429, reason: "TooManyRequests" });
    expect(await sender(apple.url).send(iphone, notification)).toEqual({ outcome: "sent", detail: null });
    apple.answers.push({ status: 500 }, { status: 503, reason: "Shutdown" }, { status: 503, reason: "Shutdown" });
    expect(await sender(apple.url).send(iphone, notification)).toEqual({ outcome: "failed", detail: "Shutdown" });
    expect(apple.requests).toHaveLength(6);
  });

  it("doesn't blame the phone for a request Apple calls malformed", async () => {
    apple = await fakeApns();
    apple.answers.push({ status: 400, reason: "BadCollapseId" });
    expect(await sender(apple.url).send(iphone, notification)).toEqual({ outcome: "failed", detail: "BadCollapseId" });
  });

  it("fails without throwing when Apple can't be reached", async () => {
    expect(await sender("http://127.0.0.1:1").send(iphone, notification)).toEqual({ outcome: "failed", detail: "unreachable" });
  });
});

describe("sending to Google", () => {
  type Call = { url: string; headers: Record<string, string>; body: string };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  /** Google, stood in for by a fetch that answers the token exchange and then whatever sends are queued. */
  function google(sends: Response[], tokens: Response[] = []) {
    const calls: Call[] = [];
    const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: String(init?.body) });
      if (url === "https://oauth2.googleapis.com/token") return tokens.shift() ?? json(200, { access_token: `access-${calls.filter((call) => call.url === url).length}`, expires_in: 3600 });
      return sends.shift() ?? json(200, { name: "projects/livepeer-test/messages/1" });
    }) as typeof fetch;
    const read = readFcmCredentials(from(fcmEnv));
    if (!read?.ok) throw new Error("test credentials");
    return { calls, sender: fcmSender({ credentials: read.value, fetch: fake, now: () => Date.parse("2026-11-21T09:00:00Z"), wait: noWait }) };
  }

  it("asks for an access token as the service account, for sending messages only, and sends with it", async () => {
    const { calls, sender } = google([]);
    expect(sender.offers("android")).toBe(true);
    expect(sender.offers("ios")).toBe(false);
    expect(await sender.send(android, notification)).toEqual({ outcome: "sent", detail: null });
    expect(await sender.send(android, notification)).toEqual({ outcome: "sent", detail: null });

    // One exchange serves both sends.
    expect(calls.map((call) => call.url)).toEqual(["https://oauth2.googleapis.com/token", "https://fcm.googleapis.com/v1/projects/livepeer-test/messages:send", "https://fcm.googleapis.com/v1/projects/livepeer-test/messages:send"]);
    const assertion = new URLSearchParams(calls[0]?.body).get("assertion") ?? "";
    const [header, claims, signature] = assertion.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: account.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: 1795251600, exp: 1795255200 });
    expect(verify("sha256", Buffer.from(`${header}.${claims}`), rsa.publicKey, Buffer.from(signature, "base64url"))).toBe(true);

    expect(calls[1]?.headers.authorization).toBe("Bearer access-1");
    expect(JSON.parse(calls[1]?.body ?? "")).toEqual({
      message: {
        token: android.token,
        notification: { title: "Livepeer", body: "The engine isn't ready" },
        data: { kind: "engine_not_ready", opens: "status" },
        android: { ttl: "3600s", priority: "HIGH", notification: { channel_id: "console_service", tag: "console-engine_not_ready" } },
      },
    });
  });

  it("calls a push token dead when Google says the app is gone or belongs to another project", async () => {
    const gone = (code: string, status: number) => json(status, { error: { code: status, status: "X", details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: code }] } });
    const { sender } = google([gone("UNREGISTERED", 404), gone("SENDER_ID_MISMATCH", 403), json(404, { error: { status: "NOT_FOUND" } })]);
    expect(await sender.send(android, notification)).toEqual({ outcome: "gone", detail: "UNREGISTERED" });
    expect(await sender.send(android, notification)).toEqual({ outcome: "gone", detail: "SENDER_ID_MISMATCH" });
    expect(await sender.send(android, notification)).toEqual({ outcome: "gone", detail: "NOT_FOUND" });
  });

  it("keeps the push token when Google calls the message itself wrong", async () => {
    const { sender } = google([json(400, { error: { status: "INVALID_ARGUMENT" } })]);
    expect(await sender.send(android, notification)).toEqual({ outcome: "failed", detail: "INVALID_ARGUMENT" });
  });

  it("says the instance's own credentials were refused: by the token exchange, or by the send", async () => {
    const exchange = google([], [json(400, { error: "invalid_grant" })]);
    expect(await exchange.sender.send(android, notification)).toEqual({ outcome: "refused", detail: "service account refused" });
    const denied = google([json(403, { error: { status: "PERMISSION_DENIED" } })]);
    expect(await denied.sender.send(android, notification)).toEqual({ outcome: "refused", detail: "PERMISSION_DENIED" });
  });

  it("asks for a new access token once when Google stops accepting the one it has", async () => {
    const { calls, sender } = google([json(401, { error: { status: "UNAUTHENTICATED" } })]);
    expect(await sender.send(android, notification)).toEqual({ outcome: "sent", detail: null });
    expect(calls.filter((call) => call.url.includes("oauth2")).length).toBe(2);
    expect(calls.at(-1)?.headers.authorization).toBe("Bearer access-2");
  });

  it("tries three times when Google is busy or can't be reached, then gives up", async () => {
    const busy = google([json(503, { error: { status: "UNAVAILABLE" } }), json(429, { error: { status: "RESOURCE_EXHAUSTED" } })]);
    expect(await busy.sender.send(android, notification)).toEqual({ outcome: "sent", detail: null });
    const down = google([json(500, {}), json(500, {}), json(503, { error: { status: "UNAVAILABLE" } })]);
    expect(await down.sender.send(android, notification)).toEqual({ outcome: "failed", detail: "UNAVAILABLE" });
    const read = readFcmCredentials(from(fcmEnv));
    if (!read?.ok) throw new Error("test credentials");
    const unreachable = fcmSender({ credentials: read.value, fetch: (async () => Promise.reject(new Error("offline"))) as typeof fetch, wait: noWait });
    expect(await unreachable.send(android, notification)).toEqual({ outcome: "failed", detail: "unreachable" });
  });
});

describe("the recording sender", () => {
  it("contacts nobody, offers both platforms, and writes down what it would have sent without the push token", async () => {
    const outbox = memoryStore<OutboxContents>({ sent: [] });
    const sender = recordingSender(outbox, () => Date.parse("2026-11-21T09:00:00Z"));
    expect([sender.offers("ios"), sender.offers("android")]).toEqual([true, true]);
    expect(await sender.send(iphone, notification)).toEqual({ outcome: "sent", detail: null });
    expect(await sender.send(android, notification)).toEqual({ outcome: "sent", detail: null });

    const { sent } = outbox.read();
    expect(sent.map((entry) => [entry.platform, entry.at])).toEqual([["ios", "2026-11-21T09:00:00.000Z"], ["android", "2026-11-21T09:00:00.000Z"]]);
    // The iOS entry is the payload itself, as `xcrun simctl push` takes it.
    expect(sent[0]?.payload).toMatchObject({ aps: { alert: { body: "The engine isn't ready" } }, opens: "status" });
    const text = JSON.stringify(sent);
    expect(text).not.toContain(iphone.token);
    expect(text).not.toContain(android.token);
  });

  it("keeps only the latest", async () => {
    const outbox = memoryStore<OutboxContents>({ sent: [] });
    const sender = recordingSender(outbox);
    for (let index = 0; index < OUTBOX_LIMIT + 5; index += 1) await sender.send(iphone, { ...notification, body: `${index + 1} jobs failed in the last hour` });
    expect(outbox.read().sent).toHaveLength(OUTBOX_LIMIT);
    expect(outbox.read().sent.at(-1)?.payload).toMatchObject({ aps: { alert: { body: `${OUTBOX_LIMIT + 5} jobs failed in the last hour` } } });
  });
});

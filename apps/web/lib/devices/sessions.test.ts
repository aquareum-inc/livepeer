import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { emptyDatabase, everythingKept, testDatabase, useTestDatabase } = await import("../data/testing");
const { postgresDeviceSessionStore } = await import("./postgres");
const { deviceSessions, DEVICE_TOKEN_PREFIX, IDLE_DAYS } = await import("./sessions");

useTestDatabase();
beforeEach(emptyDatabase);

/** The instance's own store, over the test's database. */
const deviceStore = () => postgresDeviceSessionStore(testDatabase(), secret);

const secret = "s".repeat(32);
const verifier = "a-verifier-the-app-made-and-kept-to-itself-0123";
const challenge = createHash("sha256").update(verifier).digest("base64url");
const identity = { userId: "usr_demo_adam", name: "Adam Soffer", email: "adam@example.test", role: "user" as const };

async function signIn(sessions: ReturnType<typeof deviceSessions>, platform: "ios" | "android" = "ios") {
  const code = await sessions.issueCode({ identity, builderKey: null, challenge, platform });
  return sessions.redeemCode({ code, verifier, deviceName: "Adam's iPhone", platform });
}

describe("device sessions", () => {
  it("hands a sign-in to the app that started it, once, for its verifier only", async () => {
    const store = deviceStore();
    const sessions = deviceSessions(store, secret);
    const code = await sessions.issueCode({ identity, builderKey: null, challenge, platform: "ios" });
    expect(await sessions.redeemCode({ code, verifier: "someone-else's-verifier-that-does-not-match-at-all", deviceName: "x", platform: "ios" })).toBeNull();

    const again = await sessions.issueCode({ identity, builderKey: null, challenge, platform: "ios" });
    expect(await sessions.redeemCode({ code: again, verifier, deviceName: "x", platform: "android" })).toBeNull();

    const third = await sessions.issueCode({ identity, builderKey: null, challenge, platform: "ios" });
    const token = await sessions.redeemCode({ code: third, verifier, deviceName: "Adam's iPhone", platform: "ios" });
    expect(token?.token.startsWith(DEVICE_TOKEN_PREFIX)).toBe(true);
    expect(token?.device).toMatchObject({ name: "Adam's iPhone", platform: "ios", current: true });
    expect(await sessions.redeemCode({ code: third, verifier, deviceName: "x", platform: "ios" })).toBeNull();
  });

  it("refuses a code after a minute", async () => {
    let now = Date.parse("2026-11-20T09:00:00Z");
    const sessions = deviceSessions(deviceStore(), secret, () => now);
    const code = await sessions.issueCode({ identity, builderKey: null, challenge, platform: "ios" });
    now += 61_000;
    expect(await sessions.redeemCode({ code, verifier, deviceName: "x", platform: "ios" })).toBeNull();
  });

  it("stores neither the token nor the code", async () => {
    const store = deviceStore();
    const sessions = deviceSessions(store, secret);
    const code = await sessions.issueCode({ identity, builderKey: null, challenge, platform: "ios" });
    expect(await everythingKept()).not.toContain(code);
    const token = (await sessions.redeemCode({ code, verifier, deviceName: "x", platform: "ios" }))!.token;
    expect(await everythingKept()).not.toContain(token);
    expect(await sessions.find(token)).toMatchObject({ userId: "usr_demo_adam" });
  });

  it("ends after 90 days without use, and stays alive while used", async () => {
    let now = Date.parse("2026-11-20T09:00:00Z");
    const sessions = deviceSessions(deviceStore(), secret, () => now);
    const { token } = (await signIn(sessions))!;
    now += (IDLE_DAYS - 1) * 86_400_000;
    expect(await sessions.find(token)).not.toBeNull();
    now += (IDLE_DAYS - 1) * 86_400_000;
    expect(await sessions.find(token)).not.toBeNull();
    now += IDLE_DAYS * 86_400_000;
    expect(await sessions.find(token)).toBeNull();
  });

  it("lists and revokes only the user's own devices", async () => {
    const sessions = deviceSessions(deviceStore(), secret);
    const first = (await signIn(sessions))!;
    const second = (await signIn(sessions, "android"))!;
    expect((await sessions.list("usr_demo_adam", first.device.id)).map((device) => device.current).sort()).toEqual([false, true]);
    expect(await sessions.revoke("usr_someone_else", first.device.id)).toBe(false);
    expect(await sessions.revoke("usr_demo_adam", first.device.id)).toBe(true);
    expect(await sessions.find(first.token)).toBeNull();
    expect(await sessions.revokeAll("usr_demo_adam")).toBe(1);
    expect(await sessions.find(second.token)).toBeNull();
  });

  it("rotating the session secret ends every session", async () => {
    const store = deviceStore();
    const { token } = (await signIn(deviceSessions(store, secret)))!;
    expect(await deviceSessions(store, "t".repeat(32)).find(token)).toBeNull();
  });

  it("remembers which workspace a phone is working in, per phone, and nothing more about it", async () => {
    const sessions = deviceSessions(deviceStore(), secret);
    const first = (await signIn(sessions))!;
    const second = (await signIn(sessions, "android"))!;
    expect((await sessions.find(first.token))?.workspaceId ?? null).toBeNull();
    expect(await sessions.setWorkspace(first.device.id, "wsp_northlight")).toBe(true);
    expect((await sessions.find(first.token))?.workspaceId).toBe("wsp_northlight");
    expect((await sessions.find(second.token))?.workspaceId ?? null).toBeNull();
    expect(await sessions.setWorkspace(first.device.id, null)).toBe(true);
    expect((await sessions.find(first.token))?.workspaceId).toBeNull();
    expect(await sessions.setWorkspace("dev_nope", "wsp_northlight")).toBe(false);
  });
});

import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { deviceSessions, DEVICE_TOKEN_PREFIX, IDLE_DAYS } = await import("./sessions");
type Store = import("./store").DeviceSessionStore;

/** The same contract as the file store, in memory. */
function memoryStore(): Store & { raw: () => string } {
  let contents = { sessions: [], codes: [] } as ReturnType<Store["read"]>;
  return {
    read: () => structuredClone(contents),
    update(change) {
      const next = structuredClone(contents);
      const result = change(next);
      contents = next;
      return result;
    },
    raw: () => JSON.stringify(contents),
  };
}

const secret = "s".repeat(32);
const verifier = "a-verifier-the-app-made-and-kept-to-itself-0123";
const challenge = createHash("sha256").update(verifier).digest("base64url");
const identity = { userId: "usr_demo_adam", name: "Adam Soffer", email: "adam@example.test", role: "user" as const };

function signIn(sessions: ReturnType<typeof deviceSessions>, platform: "ios" | "android" = "ios") {
  const code = sessions.issueCode({ identity, builderKey: null, challenge, platform });
  return sessions.redeemCode({ code, verifier, deviceName: "Adam's iPhone", platform });
}

describe("device sessions", () => {
  it("hands a sign-in to the app that started it, once, for its verifier only", () => {
    const store = memoryStore();
    const sessions = deviceSessions(store, secret);
    const code = sessions.issueCode({ identity, builderKey: null, challenge, platform: "ios" });
    expect(sessions.redeemCode({ code, verifier: "someone-else's-verifier-that-does-not-match-at-all", deviceName: "x", platform: "ios" })).toBeNull();

    const again = sessions.issueCode({ identity, builderKey: null, challenge, platform: "ios" });
    expect(sessions.redeemCode({ code: again, verifier, deviceName: "x", platform: "android" })).toBeNull();

    const third = sessions.issueCode({ identity, builderKey: null, challenge, platform: "ios" });
    const token = sessions.redeemCode({ code: third, verifier, deviceName: "Adam's iPhone", platform: "ios" });
    expect(token?.token.startsWith(DEVICE_TOKEN_PREFIX)).toBe(true);
    expect(token?.device).toMatchObject({ name: "Adam's iPhone", platform: "ios", current: true });
    expect(sessions.redeemCode({ code: third, verifier, deviceName: "x", platform: "ios" })).toBeNull();
  });

  it("refuses a code after a minute", () => {
    let now = Date.parse("2026-11-20T09:00:00Z");
    const sessions = deviceSessions(memoryStore(), secret, () => now);
    const code = sessions.issueCode({ identity, builderKey: null, challenge, platform: "ios" });
    now += 61_000;
    expect(sessions.redeemCode({ code, verifier, deviceName: "x", platform: "ios" })).toBeNull();
  });

  it("stores neither the token nor the code", () => {
    const store = memoryStore();
    const sessions = deviceSessions(store, secret);
    const code = sessions.issueCode({ identity, builderKey: null, challenge, platform: "ios" });
    expect(store.raw()).not.toContain(code);
    const token = sessions.redeemCode({ code, verifier, deviceName: "x", platform: "ios" })!.token;
    expect(store.raw()).not.toContain(token);
    expect(sessions.find(token)).toMatchObject({ userId: "usr_demo_adam" });
  });

  it("ends after 90 days without use, and stays alive while used", () => {
    let now = Date.parse("2026-11-20T09:00:00Z");
    const sessions = deviceSessions(memoryStore(), secret, () => now);
    const { token } = signIn(sessions)!;
    now += (IDLE_DAYS - 1) * 86_400_000;
    expect(sessions.find(token)).not.toBeNull();
    now += (IDLE_DAYS - 1) * 86_400_000;
    expect(sessions.find(token)).not.toBeNull();
    now += IDLE_DAYS * 86_400_000;
    expect(sessions.find(token)).toBeNull();
  });

  it("lists and revokes only the user's own devices", () => {
    const sessions = deviceSessions(memoryStore(), secret);
    const first = signIn(sessions)!;
    const second = signIn(sessions, "android")!;
    expect(sessions.list("usr_demo_adam", first.device.id).map((device) => device.current).sort()).toEqual([false, true]);
    expect(sessions.revoke("usr_someone_else", first.device.id)).toBe(false);
    expect(sessions.revoke("usr_demo_adam", first.device.id)).toBe(true);
    expect(sessions.find(first.token)).toBeNull();
    expect(sessions.revokeAll("usr_demo_adam")).toBe(1);
    expect(sessions.find(second.token)).toBeNull();
  });

  it("rotating the session secret ends every session", () => {
    const store = memoryStore();
    const { token } = signIn(deviceSessions(store, secret))!;
    expect(deviceSessions(store, "t".repeat(32)).find(token)).toBeNull();
  });

  it("remembers which workspace a phone is working in, per phone, and nothing more about it", () => {
    const sessions = deviceSessions(memoryStore(), secret);
    const first = signIn(sessions)!;
    const second = signIn(sessions, "android")!;
    expect(sessions.find(first.token)?.workspaceId ?? null).toBeNull();
    expect(sessions.setWorkspace(first.device.id, "wsp_northlight")).toBe(true);
    expect(sessions.find(first.token)?.workspaceId).toBe("wsp_northlight");
    expect(sessions.find(second.token)?.workspaceId ?? null).toBeNull();
    expect(sessions.setWorkspace(first.device.id, null)).toBe(true);
    expect(sessions.find(first.token)?.workspaceId).toBeNull();
    expect(sessions.setWorkspace("dev_nope", "wsp_northlight")).toBe(false);
  });
});

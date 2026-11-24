import { schema } from "@livepeer/db";
import { testDatabase } from "@livepeer/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { memoryStore } from "../data/store";
import { postgresDeviceSessionStore } from "./postgres";
import { deviceSessions } from "./sessions";
import { documentDeviceSessionStore, type Contents, type DeviceRecord, type DeviceSessionStore, type PendingCode } from "./store";

const SECRET = "s".repeat(32);
const T0 = Date.parse("2026-11-20T09:00:00Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();

const code = (extra: Partial<PendingCode> = {}): PendingCode => ({ codeHash: "code-1", challenge: "challenge", platform: "ios", userId: "usr_adam", name: "Adam Soffer", email: "adam@example.test", role: "user", builderKey: "sealed-builder-key", expiresAt: T0 + 60_000, ...extra });
const session = (extra: Partial<DeviceRecord> = {}): DeviceRecord => ({ id: "dev_1", tokenHash: "token-1", userId: "usr_adam", name: "Adam Soffer", email: "adam@example.test", role: "user", deviceName: "Adam's iPhone", platform: "ios", builderKey: null, createdAt: at(0), lastUsedAt: at(0), ...extra });

/** Both implementations, opened the same way, so one set of tests holds them to one contract. */
interface Opened {
  store: DeviceSessionStore;
  /** Everything the store holds, as it is kept. */
  kept: () => Promise<string>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

const implementations: Array<[string, () => Promise<Opened>]> = [
  [
    "a document",
    async () => {
      let document = memoryStore<Contents>({ sessions: [], codes: [] });
      const opened: Opened = {
        store: documentDeviceSessionStore(document),
        kept: async () => JSON.stringify(document.read()),
        reset: async () => {
          document = memoryStore<Contents>({ sessions: [], codes: [] });
          opened.store = documentDeviceSessionStore(document);
        },
        close: async () => undefined,
      };
      return opened;
    },
  ],
  [
    "Postgres",
    async () => {
      const { db, close } = await testDatabase();
      return {
        store: postgresDeviceSessionStore(db, SECRET),
        kept: async () => JSON.stringify([await db.select().from(schema.deviceSessions), await db.select().from(schema.deviceSignInCodes)]),
        reset: async () => {
          await db.delete(schema.deviceSessions);
          await db.delete(schema.deviceSignInCodes);
        },
        close,
      };
    },
  ],
];

describe.each(implementations)("the device session store over %s", (kind, open) => {
  let opened: Opened;
  beforeAll(async () => {
    opened = await open();
  });
  beforeEach(() => opened.reset());
  afterAll(() => opened.close());

  it("hands a pending sign-in over whole, once", async () => {
    await opened.store.putCode(code());
    expect(await opened.store.takeCode("another-code")).toBeNull();
    expect(await opened.store.takeCode("code-1")).toEqual(code());
    expect(await opened.store.takeCode("code-1")).toBeNull();
  });

  it("gives a sign-in collected twice at once to one of them only", async () => {
    await opened.store.putCode(code());
    const taken = await Promise.all([opened.store.takeCode("code-1"), opened.store.takeCode("code-1"), opened.store.takeCode("code-1")]);
    expect(taken.filter((entry) => entry !== null)).toHaveLength(1);
  });

  it("finds a session by its token's hash and by its user, and notes when it was used", async () => {
    await opened.store.createSession(session());
    await opened.store.createSession(session({ id: "dev_2", tokenHash: "token-2", platform: "android", deviceName: "Pixel" }));
    await opened.store.createSession(session({ id: "dev_3", tokenHash: "token-3", userId: "usr_rae", name: "Rae Lindqvist", email: null }));

    expect(await opened.store.findByTokenHash("token-nobody-has")).toBeNull();
    expect(await opened.store.findByTokenHash("token-1")).toMatchObject({ id: "dev_1", userId: "usr_adam", name: "Adam Soffer", email: "adam@example.test", role: "user", deviceName: "Adam's iPhone", platform: "ios", builderKey: null, createdAt: at(0), lastUsedAt: at(0) });
    expect(await opened.store.findByTokenHash("token-3")).toMatchObject({ name: "Rae Lindqvist", email: null });
    expect((await opened.store.listForUser("usr_adam")).map((entry) => entry.id).sort()).toEqual(["dev_1", "dev_2"]);
    expect(await opened.store.listForUser("usr_nobody")).toEqual([]);

    await opened.store.touch("dev_1", at(3_600_000));
    expect((await opened.store.findByTokenHash("token-1"))?.lastUsedAt).toBe(at(3_600_000));
    expect((await opened.store.findByTokenHash("token-2"))?.lastUsedAt).toBe(at(0));
  });

  it("points one session at a workspace and back, and says when there is no such session", async () => {
    await opened.store.createSession(session());
    await opened.store.createSession(session({ id: "dev_2", tokenHash: "token-2" }));
    expect((await opened.store.findByTokenHash("token-1"))?.workspaceId ?? null).toBeNull();
    expect(await opened.store.setWorkspace("dev_1", "wsp_northlight")).toBe(true);
    expect((await opened.store.findByTokenHash("token-1"))?.workspaceId).toBe("wsp_northlight");
    expect((await opened.store.findByTokenHash("token-2"))?.workspaceId ?? null).toBeNull();
    expect(await opened.store.setWorkspace("dev_1", null)).toBe(true);
    expect((await opened.store.findByTokenHash("token-1"))?.workspaceId ?? null).toBeNull();
    expect(await opened.store.setWorkspace("dev_nope", "wsp_northlight")).toBe(false);
  });

  it("ends one of a user's sessions only for that user, or all of theirs and nobody else's", async () => {
    await opened.store.createSession(session());
    await opened.store.createSession(session({ id: "dev_2", tokenHash: "token-2" }));
    await opened.store.createSession(session({ id: "dev_3", tokenHash: "token-3", userId: "usr_rae" }));
    expect(await opened.store.remove({ id: "dev_1", userId: "usr_rae" })).toBe(0);
    expect(await opened.store.remove({ id: "dev_1", userId: "usr_adam" })).toBe(1);
    expect(await opened.store.findByTokenHash("token-1")).toBeNull();
    expect(await opened.store.remove({ userId: "usr_adam" })).toBe(1);
    expect(await opened.store.remove({ userId: "usr_adam" })).toBe(0);
    expect(await opened.store.findByTokenHash("token-3")).not.toBeNull();
  });

  it("sweeps out sign-ins nobody collected and sessions nobody used, and nothing else", async () => {
    await opened.store.putCode(code());
    await opened.store.putCode(code({ codeHash: "code-2", expiresAt: T0 + 120_000 }));
    await opened.store.createSession(session());
    await opened.store.createSession(session({ id: "dev_2", tokenHash: "token-2", lastUsedAt: at(86_400_000) }));
    await opened.store.sweep({ now: T0 + 60_000, idleSince: at(0) });
    expect(await opened.store.takeCode("code-1")).toBeNull();
    expect(await opened.store.takeCode("code-2")).not.toBeNull();
    expect(await opened.store.findByTokenHash("token-1")).toBeNull();
    expect(await opened.store.findByTokenHash("token-2")).not.toBeNull();
  });

  it("runs a whole sign-in through the sessions' own rules, and a code redeemed twice at once signs in once", async () => {
    const sessions = deviceSessions(opened.store, SECRET);
    const identity = { userId: "usr_adam", name: "Adam Soffer", email: "adam@example.test", role: "user" as const };
    const verifier = "a-verifier-the-app-made-and-kept-to-itself-0123";
    const { createHash } = await import("node:crypto");
    const challenge = createHash("sha256").update(verifier).digest("base64url");

    const handoff = await sessions.issueCode({ identity, builderKey: null, challenge, platform: "ios" });
    const redeemed = await Promise.all([1, 2].map(() => sessions.redeemCode({ code: handoff, verifier, deviceName: "Adam's iPhone", platform: "ios" })));
    const issued = redeemed.filter((entry) => entry !== null);
    expect(issued).toHaveLength(1);
    const token = issued[0]!.token;

    expect(await sessions.find(token)).toMatchObject({ userId: "usr_adam", name: "Adam Soffer", email: "adam@example.test" });
    expect(await sessions.list("usr_adam", issued[0]!.device.id)).toEqual([expect.objectContaining({ name: "Adam's iPhone", current: true })]);
    expect(await sessions.revoke("usr_adam", issued[0]!.device.id)).toBe(true);
    expect(await sessions.find(token)).toBeNull();
  });

  it.runIf(kind === "Postgres")("keeps no name and no email where they can be read", async () => {
    await opened.store.putCode(code());
    await opened.store.createSession(session());
    const kept = await opened.kept();
    expect(kept).toContain("usr_adam");
    expect(kept).not.toContain("Adam Soffer");
    expect(kept).not.toContain("adam@example.test");
    // And with the secret changed, what was sealed opens for nobody: the person is known by their id alone.
    const { db, close } = await testDatabase();
    await postgresDeviceSessionStore(db, SECRET).createSession(session());
    expect(await postgresDeviceSessionStore(db, "t".repeat(32)).findByTokenHash("token-1")).toMatchObject({ userId: "usr_adam", name: "usr_adam", email: null });
    await close();
  });
});

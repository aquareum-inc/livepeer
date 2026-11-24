import { schema, type Database } from "@livepeer/db";
import { testDatabase } from "@livepeer/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { auditLog } from "./audit";
import { postgresAuditStore, postgresOperatorDeviceStore } from "./postgres";
import { confirmMessage, inputHash, unlockMessage } from "./proof";
import { operatorDeviceSessions } from "./sessions";
import type { AuditStore, OperatorDeviceRecord, OperatorDeviceStore, PendingChallenge, PhoneAlerts } from "./store";
import { TEST_CHALLENGE, TEST_SECRET, TEST_VERIFIER, testPhone } from "./testing";

const T0 = Date.parse("2026-11-21T09:00:00Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();

const session = (extra: Partial<OperatorDeviceRecord> = {}): OperatorDeviceRecord => ({ id: "opd_1", tokenHash: "token-1", userId: "usr_sam", name: "Sam Whitfield", email: "sam@example.test", deviceName: "Sam's iPhone", platform: "ios", publicKey: "public-key", createdAt: at(0), lastUsedAt: at(0), lastUnlockedAt: null, unlockedUntil: 0, failedProofs: 0, alerts: null, ...extra });
const nonce = (name: string, extra: Partial<PendingChallenge> = {}): PendingChallenge => ({ nonceHash: name, sessionId: "opd_1", operation: null, inputHash: null, expiresAt: T0 + 60_000, ...extra });
const alerts = (extra: Partial<Omit<PhoneAlerts, "lastAlertAt">> = {}): Omit<PhoneAlerts, "lastAlertAt"> => ({ kinds: ["engine_not_ready", "jobs_failing"], pushSealed: "sealed-push-token", pushHash: "push-hash-1", environment: "production", setAt: at(0), warnedAt: null, ...extra });
const entry = (id: string, extra: Record<string, unknown> = {}) => ({ id, at: at(0), event: "change" as const, user_id: "usr_sam", user_name: "Sam Whitfield", device_id: "opd_1", device_name: "Sam's iPhone", operation: null, target: null, detail: null, ...extra });

interface Opened {
  store: OperatorDeviceStore;
  audit: AuditStore;
  /** Everything the stores hold, as it is kept. */
  kept: () => Promise<string>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
  db: Database | null;
}

const implementations: Array<[string, () => Promise<Opened>]> = [
  [
    "Postgres",
    async () => {
      const { db, close } = await testDatabase();
      const tables = [schema.operatorPhoneNoticeDismissals, schema.operatorPushTokens, schema.operatorChallenges, schema.operatorDeviceSessions, schema.operatorSignInCodes, schema.operatorAudit];
      return {
        store: postgresOperatorDeviceStore(db, TEST_SECRET),
        audit: postgresAuditStore(db, TEST_SECRET),
        kept: async () => JSON.stringify(await Promise.all(tables.map((table) => db.select().from(table)))),
        reset: async () => {
          for (const table of tables) await db.delete(table);
        },
        close,
        db,
      };
    },
  ],
];

describe.each(implementations)("the operator device store over %s", (_kind, open) => {
  let opened: Opened;
  beforeAll(async () => {
    opened = await open();
  });
  beforeEach(() => opened.reset());
  afterAll(() => opened.close());
  const stored = async (id: string) => (await opened.store.sessions()).find((record) => record.id === id);

  it("hands a pending sign-in over whole, once, and to one of two that ask at once", async () => {
    const code = { codeHash: "code-1", challenge: "challenge", platform: "ios" as const, userId: "usr_sam", name: "Sam Whitfield", email: "sam@example.test", expiresAt: T0 + 60_000 };
    await opened.store.putCode(code);
    expect(await opened.store.takeCode("code-1")).toEqual(code);
    expect(await opened.store.takeCode("code-1")).toBeNull();
    await opened.store.putCode(code);
    expect((await Promise.all([opened.store.takeCode("code-1"), opened.store.takeCode("code-1")])).filter((taken) => taken !== null)).toHaveLength(1);
  });

  it("keeps a session as it was made, and finds it by its token's hash", async () => {
    await opened.store.createSession(session());
    expect(await opened.store.findByTokenHash("token-nobody-has")).toBeNull();
    expect(await opened.store.findByTokenHash("token-1")).toEqual(session());
    expect(await opened.store.sessions()).toEqual([session()]);
    await opened.store.touch("opd_1", at(3_600_000));
    expect((await stored("opd_1"))?.lastUsedAt).toBe(at(3_600_000));
  });

  it("counts refused proofs in a row, and an unlock or a good proof starts the count again", async () => {
    await opened.store.createSession(session());
    expect(await opened.store.failedProof("opd_1")).toBe(1);
    expect(await opened.store.failedProof("opd_1")).toBe(2);
    expect(await opened.store.failedProof("opd_nope")).toBe(0);
    expect(await opened.store.clearFailedProofs("opd_1")).toBe(true);
    expect(await opened.store.clearFailedProofs("opd_nope")).toBe(false);
    expect(await opened.store.failedProof("opd_1")).toBe(1);

    expect(await opened.store.unlock("opd_1", { until: T0 + 300_000, at: at(0) })).toBe(true);
    expect(await opened.store.unlock("opd_nope", { until: T0 + 300_000, at: at(0) })).toBe(false);
    expect(await stored("opd_1")).toMatchObject({ unlockedUntil: T0 + 300_000, lastUnlockedAt: at(0), failedProofs: 0 });
  });

  it("counts every request in a minute, also those arriving together, and starts again the next minute", async () => {
    await opened.store.createSession(session());
    await opened.store.createSession(session({ id: "opd_2", tokenHash: "token-2" }));
    const minute = Math.floor(T0 / 60_000);
    expect((await Promise.all(Array.from({ length: 10 }, () => opened.store.countRequest("opd_1", minute)))).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(await opened.store.countRequest("opd_2", minute)).toBe(1);
    expect(await opened.store.countRequest("opd_1", minute)).toBe(11);
    expect(await opened.store.countRequest("opd_1", minute + 1)).toBe(1);
  });

  it("gives a nonce to its own session once, and to one of two that present it at once", async () => {
    await opened.store.createSession(session());
    await opened.store.createSession(session({ id: "opd_2", tokenHash: "token-2" }));
    await opened.store.putChallenge(nonce("nonce-1", { operation: "operator_resolve_report", inputHash: "hash-of-input" }), 8);
    expect(await opened.store.takeChallenge("opd_2", "nonce-1")).toBeNull();
    expect(await opened.store.takeChallenge("opd_1", "nonce-1")).toEqual(nonce("nonce-1", { operation: "operator_resolve_report", inputHash: "hash-of-input" }));
    expect(await opened.store.takeChallenge("opd_1", "nonce-1")).toBeNull();

    await opened.store.putChallenge(nonce("nonce-2"), 8);
    expect((await Promise.all([1, 2, 3].map(() => opened.store.takeChallenge("opd_1", "nonce-2")))).filter((taken) => taken !== null)).toHaveLength(1);
  });

  it("holds only so many nonces for a session, dropping its oldest and nobody else's", async () => {
    await opened.store.createSession(session());
    await opened.store.createSession(session({ id: "opd_2", tokenHash: "token-2" }));
    await opened.store.putChallenge(nonce("other-phone", { sessionId: "opd_2", expiresAt: T0 }), 3);
    for (let index = 1; index <= 5; index += 1) await opened.store.putChallenge(nonce(`nonce-${index}`, { expiresAt: T0 + index * 1000 }), 3);
    expect(await Promise.all([1, 2, 3, 4, 5].map(async (index) => (await opened.store.takeChallenge("opd_1", `nonce-${index}`)) !== null))).toEqual([false, false, true, true, true]);
    expect(await opened.store.takeChallenge("opd_2", "other-phone")).not.toBeNull();
  });

  it("doesn't fail a request whose session went while it was being answered", async () => {
    await expect(opened.store.putChallenge(nonce("nonce-1", { sessionId: "opd_gone" }), 8)).resolves.toBeUndefined();
  });

  it("turns alerts on and off, keeps a push token on one phone only, and remembers the last alert across a new token", async () => {
    await opened.store.createSession(session());
    await opened.store.createSession(session({ id: "opd_2", tokenHash: "token-2", userId: "usr_rae", name: "Rae Lindqvist", email: null }));
    expect(await opened.store.setAlerts("opd_nope", alerts())).toBeNull();
    expect((await opened.store.setAlerts("opd_1", alerts()))?.alerts).toEqual({ ...alerts(), lastAlertAt: null });

    await opened.store.alerted(["opd_1", "opd_2"], at(1000));
    await opened.store.warned(["opd_1"], at(2000));
    expect((await stored("opd_1"))?.alerts).toMatchObject({ lastAlertAt: at(1000), warnedAt: at(2000) });
    expect((await stored("opd_2"))?.alerts).toBeNull();

    // A new push token on the same phone: the last alert is remembered, the warning is not.
    const renewed = await opened.store.setAlerts("opd_1", alerts({ pushHash: "push-hash-2", pushSealed: "another-sealed-token", kinds: ["reports_waiting"], environment: "development", setAt: at(3000) }));
    expect(renewed?.alerts).toEqual({ kinds: ["reports_waiting"], pushSealed: "another-sealed-token", pushHash: "push-hash-2", environment: "development", setAt: at(3000), lastAlertAt: at(1000), warnedAt: null });

    // The same push token turning up on another phone leaves the first.
    expect((await opened.store.setAlerts("opd_2", alerts({ pushHash: "push-hash-2" })))?.alerts?.pushHash).toBe("push-hash-2");
    expect((await stored("opd_1"))?.alerts).toBeNull();

    await opened.store.dropPushToken("opd_2");
    expect((await stored("opd_2"))?.alerts).toMatchObject({ pushSealed: null, kinds: ["engine_not_ready", "jobs_failing"] });
    expect(await opened.store.setAlerts("opd_2", null)).toMatchObject({ id: "opd_2", alerts: null });

    await opened.store.setAlerts("opd_1", alerts());
    await opened.store.clearAlerts([]);
    expect((await stored("opd_1"))?.alerts).not.toBeNull();
    await opened.store.clearAlerts(["opd_1"]);
    expect((await stored("opd_1"))?.alerts).toBeNull();
  });

  it("removes sessions by id, by person or all at once, and their nonces and alerts go with them", async () => {
    await opened.store.createSession(session());
    await opened.store.createSession(session({ id: "opd_2", tokenHash: "token-2" }));
    await opened.store.createSession(session({ id: "opd_3", tokenHash: "token-3", userId: "usr_rae" }));
    await opened.store.createSession(session({ id: "opd_4", tokenHash: "token-4", userId: "usr_rae" }));
    await opened.store.putChallenge(nonce("nonce-1"), 8);
    await opened.store.setAlerts("opd_1", alerts());

    expect(await opened.store.remove({ ids: [] })).toEqual([]);
    expect(await opened.store.remove({ ids: ["opd_1", "opd_nope"] })).toEqual([session()]);
    expect(await opened.store.takeChallenge("opd_1", "nonce-1")).toBeNull();
    // The push token left with the session, so another phone may hold it.
    expect((await opened.store.setAlerts("opd_2", alerts()))?.alerts?.pushHash).toBe("push-hash-1");

    expect((await opened.store.remove({ userId: "usr_rae" })).map((record) => record.id).sort()).toEqual(["opd_3", "opd_4"]);
    expect((await opened.store.remove("all")).map((record) => record.id)).toEqual(["opd_2"]);
    expect(await opened.store.sessions()).toEqual([]);
  });

  it("sweeps out sign-ins and nonces whose time has passed, and nothing else", async () => {
    await opened.store.createSession(session());
    await opened.store.putCode({ codeHash: "code-old", challenge: "c", platform: "ios", userId: "usr_sam", name: "Sam Whitfield", email: null, expiresAt: T0 });
    await opened.store.putCode({ codeHash: "code-new", challenge: "c", platform: "ios", userId: "usr_sam", name: "Sam Whitfield", email: null, expiresAt: T0 + 60_000 });
    await opened.store.putChallenge(nonce("nonce-old", { expiresAt: T0 }), 8);
    await opened.store.putChallenge(nonce("nonce-new"), 8);
    await opened.store.sweep(T0);
    expect(await opened.store.takeCode("code-old")).toBeNull();
    expect(await opened.store.takeCode("code-new")).not.toBeNull();
    expect(await opened.store.takeChallenge("opd_1", "nonce-old")).toBeNull();
    expect(await opened.store.takeChallenge("opd_1", "nonce-new")).not.toBeNull();
  });

  it("keeps the audit log newest first, in the order it was written, and only its newest entries", async () => {
    for (const id of ["aud_1", "aud_2", "aud_3", "aud_4", "aud_5"]) await opened.audit.append(entry(id), 3);
    // All five were written in the same millisecond.
    expect((await opened.audit.newest(10)).map((kept) => kept.id)).toEqual(["aud_5", "aud_4", "aud_3"]);
    expect(await opened.audit.newest(1)).toEqual([entry("aud_5")]);
  });

  it("counts a phone's entries of one kind since a time, by how their detail starts", async () => {
    await opened.audit.append(entry("aud_1", { event: "alert", detail: "test: sent", at: at(-7_200_000) }), 100);
    await opened.audit.append(entry("aud_2", { event: "alert", detail: "test: sent" }), 100);
    await opened.audit.append(entry("aud_3", { event: "alert", detail: "test: failed (unreachable)" }), 100);
    await opened.audit.append(entry("aud_4", { event: "alert", detail: "jobs_failing: sent" }), 100);
    await opened.audit.append(entry("aud_5", { event: "alert", detail: "test: sent", device_id: "opd_2" }), 100);
    await opened.audit.append(entry("aud_6", { event: "change", detail: "test: sent" }), 100);
    await opened.audit.append(entry("aud_7", { event: "alert", detail: "tests sent" }), 100);
    const since = at(-3_600_000);
    expect(await opened.audit.countSince({ event: "alert", deviceId: "opd_1", detailStartsWith: "test: ", since })).toBe(2);
    // The start of the detail is taken as written, not as a pattern.
    expect(await opened.audit.countSince({ event: "alert", deviceId: "opd_1", detailStartsWith: "te%", since })).toBe(0);
    expect(await opened.audit.countSince({ event: "alert", deviceId: "opd_1", detailStartsWith: "t_st", since })).toBe(0);
  });

  it("runs enrolment, an unlock, a change and a revocation through the sessions' own rules, each single-use step once", async () => {
    const clock = { now: T0 };
    const log = auditLog(opened.audit, () => clock.now);
    const sessions = operatorDeviceSessions(opened.store, TEST_SECRET, log, () => clock.now);
    const phone = testPhone();
    const identity = { userId: "usr_sam", name: "Sam Whitfield", email: "sam@example.test", role: "operator" as const };

    const code = (await sessions.issueCode({ identity, challenge: TEST_CHALLENGE, platform: "ios" }))!;
    const redeemed = await Promise.all([1, 2].map(() => sessions.redeemCode({ code, verifier: TEST_VERIFIER, deviceName: "Sam's iPhone", platform: "ios", publicKey: phone.rawPublicKey })));
    const issued = redeemed.filter((token) => token !== null);
    expect(issued).toHaveLength(1);
    const token = issued[0]!.token;
    const found = (await sessions.find(token))!;
    expect(found).toMatchObject({ userId: "usr_sam", name: "Sam Whitfield", email: "sam@example.test", unlockedUntil: 0 });

    const unlocking = await sessions.challenge(found, null);
    expect(await sessions.unlock(found, unlocking.nonce, phone.sign(unlockMessage(unlocking.nonce)))).not.toBeNull();
    expect(sessions.unlocked((await sessions.find(token))!)).toBe(true);

    const input = { id: "rep_1", outcome: "hidden" };
    const { nonce: forChange } = await sessions.challenge(found, { operation: "operator_resolve_report", inputHash: inputHash(input) });
    const proof = `${forChange}.${phone.sign(confirmMessage(forChange, "operator_resolve_report", inputHash(input)))}`;
    // The same proof presented twice at once makes the change once.
    expect((await Promise.all([1, 2].map(() => sessions.prove(found, "operator_resolve_report", input, proof)))).filter(Boolean)).toHaveLength(1);

    const state = await sessions.setAlerts(found, { kinds: ["engine_not_ready"], pushToken: "ab".repeat(32), environment: "production" });
    expect(state.state).toBe("on");
    expect(await sessions.alertTargets("engine_not_ready")).toEqual([expect.objectContaining({ sessionId: found.id, pushToken: "ab".repeat(32), name: "Sam Whitfield" })]);

    expect(await sessions.revoke(found.id, { userId: "usr_rae", name: "Rae Lindqvist", deviceId: null, deviceName: null })).toBe(true);
    expect(await sessions.find(token)).toBeNull();
    expect(await sessions.anyAlerts()).toBe(false);
    expect((await log.list(10)).map((written) => written.event)).toEqual(["revoked", "refused", "unlock", "sign_in"]);
    expect((await log.list(10))[0]).toMatchObject({ user_name: "Rae Lindqvist", target: "usr_sam", device_name: "Sam's iPhone" });

    const kept = await opened.kept();
    expect(kept).toContain("usr_rae");
    for (const secret of ["Sam Whitfield", "Rae Lindqvist", "sam@example.test", token, code, unlocking.nonce, forChange, "ab".repeat(32)]) expect(kept, secret).not.toContain(secret);
  });

  it("remembers whose notice was closed for which phone, once, by ids only, and forgets it with the session", async () => {
    await opened.store.createSession(session());
    await opened.store.createSession(session({ id: "opd_2", tokenHash: "token-2", userId: "usr_rae", name: "Rae Lindqvist", email: "rae@example.test" }));
    expect(await opened.store.noticesDismissedBy("usr_rae")).toEqual([]);

    await opened.store.dismissNotice("usr_rae", ["opd_1"], at(1000));
    // Closing it again, twice at once, and for a phone that is gone, changes nothing and refuses nothing.
    await Promise.all([opened.store.dismissNotice("usr_rae", ["opd_1", "opd_gone"], at(2000)), opened.store.dismissNotice("usr_rae", ["opd_1"], at(3000))]);
    await opened.store.dismissNotice("usr_rae", [], at(4000));
    expect(await opened.store.noticesDismissedBy("usr_rae")).toEqual(["opd_1"]);
    // One operator closing it closes it for nobody else, the one who added the phone included.
    expect(await opened.store.noticesDismissedBy("usr_sam")).toEqual([]);

    await opened.store.dismissNotice("usr_sam", ["opd_1", "opd_2"], at(5000));
    expect((await opened.store.noticesDismissedBy("usr_sam")).sort()).toEqual(["opd_1", "opd_2"]);
    if (opened.db) {
      const rows = await opened.db.select().from(schema.operatorPhoneNoticeDismissals);
      expect(rows).toHaveLength(3);
      expect(rows.find((row) => row.userId === "usr_rae")).toEqual({ userId: "usr_rae", sessionId: "opd_1", dismissedAt: new Date(at(1000)), seenAt: null });
      expect(JSON.stringify(rows)).not.toMatch(/Sam Whitfield|Rae Lindqvist|example\.test/);
    }

    // Seen is per operator, covers what they have closed so far, and the first time it was seen stands.
    expect((await opened.store.noticesUnseenBy("usr_sam")).sort()).toEqual(["opd_1", "opd_2"]);
    await opened.store.markNoticesSeen("usr_sam", at(6000));
    await opened.store.markNoticesSeen("usr_sam", at(7000));
    expect(await opened.store.noticesUnseenBy("usr_sam")).toEqual([]);
    expect(await opened.store.noticesUnseenBy("usr_rae")).toEqual(["opd_1"]);
    expect((await opened.store.noticesDismissedBy("usr_sam")).sort()).toEqual(["opd_1", "opd_2"]);
    if (opened.db) expect((await opened.db.select().from(schema.operatorPhoneNoticeDismissals)).filter((row) => row.userId === "usr_sam").map((row) => row.seenAt)).toEqual([new Date(at(6000)), new Date(at(6000))]);
    await opened.store.markNoticesSeen("usr_nobody", at(8000));

    await opened.store.remove({ ids: ["opd_1"] });
    expect(await opened.store.noticesDismissedBy("usr_rae")).toEqual([]);
    expect(await opened.store.noticesDismissedBy("usr_sam")).toEqual(["opd_2"]);
  });

  it("keeps no name and no email where they can be read, and opens them for nobody once the secret has changed", async () => {
    await opened.store.createSession(session());
    await opened.store.putCode({ codeHash: "code-1", challenge: "c", platform: "ios", userId: "usr_sam", name: "Sam Whitfield", email: "sam@example.test", expiresAt: T0 + 60_000 });
    await opened.audit.append(entry("aud_1"), 100);
    const kept = await opened.kept();
    expect(kept).toContain("usr_sam");
    expect(kept).not.toContain("Sam Whitfield");
    expect(kept).not.toContain("sam@example.test");

    const db = opened.db!;
    const rotated = "a-different-secret-of-thirty-two-chars";
    expect(await postgresOperatorDeviceStore(db, rotated).sessions()).toEqual([expect.objectContaining({ userId: "usr_sam", name: "usr_sam", email: null })]);
    expect(await postgresAuditStore(db, rotated).newest(1)).toEqual([expect.objectContaining({ user_id: "usr_sam", user_name: "usr_sam" })]);
  });
});

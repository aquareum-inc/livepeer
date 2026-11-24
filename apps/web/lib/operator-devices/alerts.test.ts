import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { auditLog } = await import("./audit");
const { unlockMessage } = await import("./proof");
const { operatorDeviceSessions, ABSOLUTE_DAYS, ALERTS_WARNING_DAYS, IDLE_DAYS, MAX_FAILED_PROOFS } = await import("./sessions");
const { emptyDatabase, everythingKept, useTestDatabase } = await import("../data/testing");
const { TEST_CHALLENGE, TEST_SECRET, TEST_VERIFIER, testAudit, testOperatorDevices, testPhone } = await import("./testing");

useTestDatabase();
beforeEach(emptyDatabase);

const sam = { userId: "usr_demo_sam", name: "Sam Whitfield", email: "sam@example.test", role: "operator" as const };
const rae = { userId: "usr_demo_rae", name: "Rae Lindqvist", email: "rae@example.test", role: "operator" as const };
const DAY = 86_400_000;
const PUSH = "ab".repeat(32);
const OTHER_PUSH = "cd".repeat(32);
const web = { userId: "usr_demo_rae", name: "Rae Lindqvist", deviceId: null, deviceName: null };

function setup(secret = TEST_SECRET) {
  const clock = { now: Date.parse("2026-11-21T09:00:00Z") };
  const store = testOperatorDevices(secret);
  const audit = auditLog(testAudit(), () => clock.now);
  const sessions = operatorDeviceSessions(store, secret, audit, () => clock.now);
  const enrol = async (identity: typeof sam = sam, deviceName = "Sam's iPhone") => {
    const phone = testPhone();
    const code = (await sessions.issueCode({ identity, challenge: TEST_CHALLENGE, platform: "ios" }))!;
    const issued = (await sessions.redeemCode({ code, verifier: TEST_VERIFIER, deviceName, platform: "ios", publicKey: phone.rawPublicKey }))!;
    return { ...issued, phone, session: async () => (await sessions.find(issued.token))! };
  };
  const stored = async (id: string) => (await store.sessions()).find((entry) => entry.id === id);
  return { clock, store, audit, sessions, enrol, stored };
}

/** One phone with alerts on for everything. */
async function alerting() {
  const world = setup();
  const phone = await world.enrol();
  await world.sessions.setAlerts(await phone.session(), { kinds: ["engine_not_ready", "jobs_failing", "reports_waiting"], pushToken: PUSH, environment: "production" });
  return { ...world, phone };
}

describe("where a push token lives", () => {
  it("is on the phone's own session, sealed, and comes back only to be sent to", async () => {
    const { sessions, phone } = await alerting();
    expect(sessions.alerts(await phone.session())).toEqual({ state: "on", kinds: ["engine_not_ready", "jobs_failing", "reports_waiting"], until: new Date(Date.parse("2026-11-21T09:00:00Z") + ABSOLUTE_DAYS * DAY).toISOString(), lastAlertAt: null });
    expect(await everythingKept()).not.toContain(PUSH);
    expect(await sessions.alertTargets("engine_not_ready")).toEqual([{ sessionId: phone.device.id, userId: "usr_demo_sam", name: "Sam Whitfield", deviceName: "Sam's iPhone", platform: "ios", environment: "production", pushToken: PUSH }]);
    expect(await sessions.anyAlerts()).toBe(true);
  });

  it("is told only what it chose", async () => {
    const { sessions, enrol } = setup();
    const phone = await enrol();
    await sessions.setAlerts(await phone.session(), { kinds: ["reports_waiting"], pushToken: PUSH, environment: "development" });
    expect(await sessions.alertTargets("engine_not_ready")).toEqual([]);
    expect(await sessions.alertTargets("reports_waiting")).toMatchObject([{ environment: "development" }]);
    // Something every phone hears, such as a phone being added, ignores the choice.
    expect(await sessions.alertTargets(null)).toHaveLength(1);
    expect(await sessions.alertTargets(null, { except: phone.device.id })).toEqual([]);
    expect(await sessions.alertTargets(null, { only: ["opd_someone_else"] })).toEqual([]);
  });

  it("belongs to one phone: setting it on a second session takes it from the first", async () => {
    const { sessions, enrol } = setup();
    const first = await enrol();
    await sessions.setAlerts(await first.session(), { kinds: ["engine_not_ready"], pushToken: PUSH, environment: "production" });
    const again = await enrol();
    await sessions.setAlerts(await again.session(), { kinds: ["engine_not_ready"], pushToken: PUSH, environment: "production" });
    expect((await sessions.alertTargets("engine_not_ready")).map((target) => target.sessionId)).toEqual([again.device.id]);
    expect(sessions.alerts(await first.session()).state).toBe("off");
    // Another phone's own push token is left alone.
    const rae2 = await enrol(rae, "Rae's iPhone");
    await sessions.setAlerts(await rae2.session(), { kinds: ["engine_not_ready"], pushToken: OTHER_PUSH, environment: "production" });
    expect(await sessions.alertTargets("engine_not_ready")).toHaveLength(2);
  });

  it("shows on the web's list of phones, without the push token", async () => {
    const { sessions, phone, enrol } = await alerting();
    await enrol(rae, "Rae's iPhone");
    const list = await sessions.list();
    expect(list.map((entry) => [entry.name, entry.alerts, entry.signed_out])).toEqual(expect.arrayContaining([["Sam's iPhone", "on", false], ["Rae's iPhone", "off", false]]));
    expect(list.find((entry) => entry.id === phone.device.id)?.alerts_until).toBe(list.find((entry) => entry.id === phone.device.id)?.expires_at);
    expect(JSON.stringify(list)).not.toMatch(/push|sealed/i);
  });
});

describe("what ends a phone's alerts", () => {
  it("the operator turning them off: the push token is forgotten at once", async () => {
    const { sessions, phone, stored } = await alerting();
    expect(await sessions.setAlerts(await phone.session(), { kinds: [], pushToken: null, environment: "production" })).toMatchObject({ state: "off", until: null });
    expect((await stored(phone.device.id))?.alerts).toBeNull();
    expect(await sessions.anyAlerts()).toBe(false);
  });

  it("signing out of the console on the phone", async () => {
    const { sessions, phone } = await alerting();
    await sessions.end(await phone.session());
    expect(await sessions.alertTargets(null)).toEqual([]);
  });

  it("revoking it, or every phone, from the web console", async () => {
    const one = await alerting();
    await one.sessions.revoke(one.phone.device.id, web);
    expect(await one.sessions.alertTargets(null)).toEqual([]);
    const all = await alerting();
    await all.sessions.revokeAll(web);
    expect(await all.sessions.alertTargets(null)).toEqual([]);
  });

  it("the person being suspended or losing the operator role", async () => {
    const { sessions } = await alerting();
    await sessions.revokeUser("usr_demo_sam", "operator role removed");
    expect(await sessions.alertTargets(null)).toEqual([]);
  });

  it("five refused proofs in a row", async () => {
    const { sessions, phone } = await alerting();
    const stranger = testPhone();
    for (let attempt = 0; attempt < MAX_FAILED_PROOFS; attempt += 1) {
      const { nonce } = await sessions.challenge(await phone.session(), null);
      expect(await sessions.unlock(await phone.session(), nonce, stranger.sign(unlockMessage(nonce)))).toBeNull();
    }
    expect(await sessions.find(phone.token)).toBeNull();
    expect(await sessions.alertTargets(null)).toEqual([]);
  });

  it("a new session secret: the push token can no longer be read, and is dropped", async () => {
    const { store, phone } = await alerting();
    const rotated = operatorDeviceSessions(store, "a-different-secret-of-thirty-two-chars", auditLog(testAudit()), () => Date.parse("2026-11-21T10:00:00Z"));
    expect(await rotated.alertTargets(null)).toEqual([]);
    expect((await store.sessions()).find((entry) => entry.id === phone.device.id)?.alerts).toBeNull();
  });

  it("the session's absolute end, with a warning a few days before and one notice at the end", async () => {
    const { sessions, clock, phone } = await alerting();
    const keepUsing = () => sessions.find(phone.token);
    for (let day = 1; day < ABSOLUTE_DAYS - ALERTS_WARNING_DAYS; day += 1) {
      clock.now += DAY;
      keepUsing();
      expect(await sessions.alertEndings(), `day ${day}`).toEqual({ warn: [], ended: [] });
    }
    clock.now += DAY;
    keepUsing();
    expect(await sessions.alertEndings()).toMatchObject({ warn: [{ sessionId: phone.device.id, daysLeft: ALERTS_WARNING_DAYS, pushToken: PUSH }], ended: [] });
    // Once only.
    expect(await sessions.alertEndings()).toEqual({ warn: [], ended: [] });
    clock.now += ALERTS_WARNING_DAYS * DAY + 1;
    expect(await sessions.alertTargets(null)).toEqual([]);
    expect(await sessions.alertEndings()).toMatchObject({ warn: [], ended: [{ sessionId: phone.device.id, pushToken: PUSH }] });
    expect(await sessions.alertEndings()).toEqual({ warn: [], ended: [] });
  });

  it("isn't warned about an end it was shown when it turned alerts on", async () => {
    const { sessions, clock, enrol } = setup();
    const phone = await enrol();
    // Used every day, so the console is still open two days before the end.
    for (let day = 1; day <= ABSOLUTE_DAYS - 2; day += 1) {
      clock.now += DAY;
      expect(await sessions.find(phone.token), `day ${day}`).not.toBeNull();
    }
    await sessions.setAlerts(await phone.session(), { kinds: ["engine_not_ready"], pushToken: PUSH, environment: "production" });
    expect(await sessions.alertEndings()).toEqual({ warn: [], ended: [] });
    clock.now += DAY;
    expect(await sessions.alertEndings()).toEqual({ warn: [], ended: [] });
  });

  it("Apple or Google saying the push token is dead: it is forgotten, and the phone shows as not reached", async () => {
    const { sessions, phone, stored } = await alerting();
    await sessions.dropPushToken(phone.device.id);
    expect(sessions.alerts(await phone.session())).toMatchObject({ state: "not_reaching", kinds: ["engine_not_ready", "jobs_failing", "reports_waiting"] });
    expect((await stored(phone.device.id))?.alerts?.pushSealed).toBeNull();
    expect(await sessions.alertTargets(null)).toEqual([]);
    expect((await sessions.list())[0]).toMatchObject({ alerts: "not_reaching" });
    // Turning them back on with the phone's new push token mends it.
    await sessions.setAlerts(await phone.session(), { kinds: ["engine_not_ready"], pushToken: OTHER_PUSH, environment: "production" });
    expect(sessions.alerts(await phone.session()).state).toBe("on");
  });
});

describe("a quiet week", () => {
  it("ends the console on the phone but not its alerts, which carry on to the session's end", async () => {
    const { sessions, clock, phone } = await alerting();
    clock.now += (IDLE_DAYS + 1) * DAY;
    // The token opens nothing, exactly as before.
    expect(await sessions.find(phone.token)).toBeNull();
    // The phone is still told, still listed, and says why.
    expect(await sessions.alertTargets("engine_not_ready")).toHaveLength(1);
    expect(await sessions.list()).toMatchObject([{ id: phone.device.id, alerts: "on", signed_out: true }]);
    // And it can still be revoked from the web.
    expect(await sessions.revoke(phone.device.id, web)).toBe(true);
    expect(await sessions.alertTargets(null)).toEqual([]);
    expect(await sessions.list()).toEqual([]);
  });

  it("keeps such a phone when another signs in, and drops idle phones with nothing to be told", async () => {
    const { sessions, clock, enrol, stored } = setup();
    const silent = await enrol(rae, "Rae's iPhone");
    const told = await enrol();
    await sessions.setAlerts(await told.session(), { kinds: ["reports_waiting"], pushToken: PUSH, environment: "production" });
    const unreachable = await enrol(sam, "Sam's old iPhone");
    await sessions.setAlerts(await unreachable.session(), { kinds: ["reports_waiting"], pushToken: OTHER_PUSH, environment: "production" });
    await sessions.dropPushToken(unreachable.device.id);

    clock.now += (IDLE_DAYS + 1) * DAY;
    expect((await sessions.list()).map((entry) => entry.id)).toEqual([told.device.id]);
    await enrol(rae, "Rae's new iPhone");
    expect((await stored(told.device.id))).toBeDefined();
    expect((await stored(silent.device.id))).toBeUndefined();
    expect((await stored(unreachable.device.id))).toBeUndefined();
  });

  it("stops at the absolute end all the same", async () => {
    const { sessions, clock } = await alerting();
    clock.now += ABSOLUTE_DAYS * DAY + 1;
    expect(await sessions.alertTargets(null)).toEqual([]);
    expect(await sessions.list()).toEqual([]);
  });
});

it("notes when alerts last reached a phone", async () => {
  const { sessions, clock, phone } = await alerting();
  clock.now += 3_600_000;
  await sessions.alerted([phone.device.id, "opd_unknown"]);
  expect(sessions.alerts(await phone.session()).lastAlertAt).toBe("2026-11-21T10:00:00.000Z");
});

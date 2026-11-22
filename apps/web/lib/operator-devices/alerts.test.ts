import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { auditLog } = await import("./audit");
const { unlockMessage } = await import("./proof");
const { operatorDeviceSessions, ABSOLUTE_DAYS, ALERTS_WARNING_DAYS, IDLE_DAYS, MAX_FAILED_PROOFS } = await import("./sessions");
const { TEST_CHALLENGE, TEST_SECRET, TEST_VERIFIER, emptyAudit, emptyOperatorDevices, testPhone } = await import("./testing");

const sam = { userId: "usr_demo_sam", name: "Sam Whitfield", email: "sam@example.test", role: "operator" as const };
const rae = { userId: "usr_demo_rae", name: "Rae Lindqvist", email: "rae@example.test", role: "operator" as const };
const DAY = 86_400_000;
const PUSH = "ab".repeat(32);
const OTHER_PUSH = "cd".repeat(32);
const web = { userId: "usr_demo_rae", name: "Rae Lindqvist", deviceId: null, deviceName: null };

function setup(secret = TEST_SECRET) {
  const clock = { now: Date.parse("2026-11-21T09:00:00Z") };
  const store = emptyOperatorDevices();
  const audit = auditLog(emptyAudit(), () => clock.now);
  const sessions = operatorDeviceSessions(store, secret, audit, () => clock.now);
  const enrol = (identity: typeof sam = sam, deviceName = "Sam's iPhone") => {
    const phone = testPhone();
    const code = sessions.issueCode({ identity, challenge: TEST_CHALLENGE, platform: "ios" })!;
    const issued = sessions.redeemCode({ code, verifier: TEST_VERIFIER, deviceName, platform: "ios", publicKey: phone.rawPublicKey })!;
    return { ...issued, phone, session: () => sessions.find(issued.token)! };
  };
  const stored = (id: string) => store.read().sessions.find((entry) => entry.id === id);
  return { clock, store, audit, sessions, enrol, stored };
}

/** One phone with alerts on for everything. */
function alerting() {
  const world = setup();
  const phone = world.enrol();
  world.sessions.setAlerts(phone.session(), { kinds: ["engine_not_ready", "jobs_failing", "reports_waiting"], pushToken: PUSH, environment: "production" });
  return { ...world, phone };
}

describe("where a push token lives", () => {
  it("is on the phone's own session, sealed, and comes back only to be sent to", () => {
    const { sessions, store, phone } = alerting();
    expect(sessions.alerts(phone.session())).toEqual({ state: "on", kinds: ["engine_not_ready", "jobs_failing", "reports_waiting"], until: new Date(Date.parse("2026-11-21T09:00:00Z") + ABSOLUTE_DAYS * DAY).toISOString(), lastAlertAt: null });
    expect(JSON.stringify(store.read())).not.toContain(PUSH);
    expect(sessions.alertTargets("engine_not_ready")).toEqual([{ sessionId: phone.device.id, userId: "usr_demo_sam", name: "Sam Whitfield", deviceName: "Sam's iPhone", platform: "ios", environment: "production", pushToken: PUSH }]);
    expect(sessions.anyAlerts()).toBe(true);
  });

  it("is told only what it chose", () => {
    const { sessions, enrol } = setup();
    const phone = enrol();
    sessions.setAlerts(phone.session(), { kinds: ["reports_waiting"], pushToken: PUSH, environment: "development" });
    expect(sessions.alertTargets("engine_not_ready")).toEqual([]);
    expect(sessions.alertTargets("reports_waiting")).toMatchObject([{ environment: "development" }]);
    // Something every phone hears, such as a phone being added, ignores the choice.
    expect(sessions.alertTargets(null)).toHaveLength(1);
    expect(sessions.alertTargets(null, { except: phone.device.id })).toEqual([]);
    expect(sessions.alertTargets(null, { only: ["opd_someone_else"] })).toEqual([]);
  });

  it("belongs to one phone: setting it on a second session takes it from the first", () => {
    const { sessions, enrol } = setup();
    const first = enrol();
    sessions.setAlerts(first.session(), { kinds: ["engine_not_ready"], pushToken: PUSH, environment: "production" });
    const again = enrol();
    sessions.setAlerts(again.session(), { kinds: ["engine_not_ready"], pushToken: PUSH, environment: "production" });
    expect(sessions.alertTargets("engine_not_ready").map((target) => target.sessionId)).toEqual([again.device.id]);
    expect(sessions.alerts(first.session()).state).toBe("off");
    // Another phone's own push token is left alone.
    const rae2 = enrol(rae, "Rae's iPhone");
    sessions.setAlerts(rae2.session(), { kinds: ["engine_not_ready"], pushToken: OTHER_PUSH, environment: "production" });
    expect(sessions.alertTargets("engine_not_ready")).toHaveLength(2);
  });

  it("shows on the web's list of phones, without the push token", () => {
    const { sessions, phone, enrol } = alerting();
    enrol(rae, "Rae's iPhone");
    const list = sessions.list();
    expect(list.map((entry) => [entry.name, entry.alerts, entry.signed_out])).toEqual(expect.arrayContaining([["Sam's iPhone", "on", false], ["Rae's iPhone", "off", false]]));
    expect(list.find((entry) => entry.id === phone.device.id)?.alerts_until).toBe(list.find((entry) => entry.id === phone.device.id)?.expires_at);
    expect(JSON.stringify(list)).not.toMatch(/push|sealed/i);
  });
});

describe("what ends a phone's alerts", () => {
  it("the operator turning them off: the push token is forgotten at once", () => {
    const { sessions, phone, stored } = alerting();
    expect(sessions.setAlerts(phone.session(), { kinds: [], pushToken: null, environment: "production" })).toMatchObject({ state: "off", until: null });
    expect(stored(phone.device.id)?.alerts).toBeNull();
    expect(sessions.anyAlerts()).toBe(false);
  });

  it("signing out of the console on the phone", () => {
    const { sessions, phone } = alerting();
    sessions.end(phone.session());
    expect(sessions.alertTargets(null)).toEqual([]);
  });

  it("revoking it, or every phone, from the web console", () => {
    const one = alerting();
    one.sessions.revoke(one.phone.device.id, web);
    expect(one.sessions.alertTargets(null)).toEqual([]);
    const all = alerting();
    all.sessions.revokeAll(web);
    expect(all.sessions.alertTargets(null)).toEqual([]);
  });

  it("the person being suspended or losing the operator role", () => {
    const { sessions } = alerting();
    sessions.revokeUser("usr_demo_sam", "operator role removed");
    expect(sessions.alertTargets(null)).toEqual([]);
  });

  it("five refused proofs in a row", () => {
    const { sessions, phone } = alerting();
    const stranger = testPhone();
    for (let attempt = 0; attempt < MAX_FAILED_PROOFS; attempt += 1) {
      const { nonce } = sessions.challenge(phone.session(), null);
      expect(sessions.unlock(phone.session(), nonce, stranger.sign(unlockMessage(nonce)))).toBeNull();
    }
    expect(sessions.find(phone.token)).toBeNull();
    expect(sessions.alertTargets(null)).toEqual([]);
  });

  it("a new session secret: the push token can no longer be read, and is dropped", () => {
    const { store, phone } = alerting();
    const rotated = operatorDeviceSessions(store, "a-different-secret-of-thirty-two-chars", auditLog(emptyAudit()), () => Date.parse("2026-11-21T10:00:00Z"));
    expect(rotated.alertTargets(null)).toEqual([]);
    expect(store.read().sessions.find((entry) => entry.id === phone.device.id)?.alerts).toBeNull();
  });

  it("the session's absolute end, with a warning a few days before and one notice at the end", () => {
    const { sessions, clock, phone } = alerting();
    const keepUsing = () => sessions.find(phone.token);
    for (let day = 1; day < ABSOLUTE_DAYS - ALERTS_WARNING_DAYS; day += 1) {
      clock.now += DAY;
      keepUsing();
      expect(sessions.alertEndings(), `day ${day}`).toEqual({ warn: [], ended: [] });
    }
    clock.now += DAY;
    keepUsing();
    expect(sessions.alertEndings()).toMatchObject({ warn: [{ sessionId: phone.device.id, daysLeft: ALERTS_WARNING_DAYS, pushToken: PUSH }], ended: [] });
    // Once only.
    expect(sessions.alertEndings()).toEqual({ warn: [], ended: [] });
    clock.now += ALERTS_WARNING_DAYS * DAY + 1;
    expect(sessions.alertTargets(null)).toEqual([]);
    expect(sessions.alertEndings()).toMatchObject({ warn: [], ended: [{ sessionId: phone.device.id, pushToken: PUSH }] });
    expect(sessions.alertEndings()).toEqual({ warn: [], ended: [] });
  });

  it("isn't warned about an end it was shown when it turned alerts on", () => {
    const { sessions, clock, enrol } = setup();
    const phone = enrol();
    // Used every day, so the console is still open two days before the end.
    for (let day = 1; day <= ABSOLUTE_DAYS - 2; day += 1) {
      clock.now += DAY;
      expect(sessions.find(phone.token), `day ${day}`).not.toBeNull();
    }
    sessions.setAlerts(phone.session(), { kinds: ["engine_not_ready"], pushToken: PUSH, environment: "production" });
    expect(sessions.alertEndings()).toEqual({ warn: [], ended: [] });
    clock.now += DAY;
    expect(sessions.alertEndings()).toEqual({ warn: [], ended: [] });
  });

  it("Apple or Google saying the push token is dead: it is forgotten, and the phone shows as not reached", () => {
    const { sessions, phone, stored } = alerting();
    sessions.dropPushToken(phone.device.id);
    expect(sessions.alerts(phone.session())).toMatchObject({ state: "not_reaching", kinds: ["engine_not_ready", "jobs_failing", "reports_waiting"] });
    expect(stored(phone.device.id)?.alerts?.pushSealed).toBeNull();
    expect(sessions.alertTargets(null)).toEqual([]);
    expect(sessions.list()[0]).toMatchObject({ alerts: "not_reaching" });
    // Turning them back on with the phone's new push token mends it.
    sessions.setAlerts(phone.session(), { kinds: ["engine_not_ready"], pushToken: OTHER_PUSH, environment: "production" });
    expect(sessions.alerts(phone.session()).state).toBe("on");
  });
});

describe("a quiet week", () => {
  it("ends the console on the phone but not its alerts, which carry on to the session's end", () => {
    const { sessions, clock, phone } = alerting();
    clock.now += (IDLE_DAYS + 1) * DAY;
    // The token opens nothing, exactly as before.
    expect(sessions.find(phone.token)).toBeNull();
    // The phone is still told, still listed, and says why.
    expect(sessions.alertTargets("engine_not_ready")).toHaveLength(1);
    expect(sessions.list()).toMatchObject([{ id: phone.device.id, alerts: "on", signed_out: true }]);
    // And it can still be revoked from the web.
    expect(sessions.revoke(phone.device.id, web)).toBe(true);
    expect(sessions.alertTargets(null)).toEqual([]);
    expect(sessions.list()).toEqual([]);
  });

  it("keeps such a phone when another signs in, and drops idle phones with nothing to be told", () => {
    const { sessions, clock, enrol, stored } = setup();
    const silent = enrol(rae, "Rae's iPhone");
    const told = enrol();
    sessions.setAlerts(told.session(), { kinds: ["reports_waiting"], pushToken: PUSH, environment: "production" });
    const unreachable = enrol(sam, "Sam's old iPhone");
    sessions.setAlerts(unreachable.session(), { kinds: ["reports_waiting"], pushToken: OTHER_PUSH, environment: "production" });
    sessions.dropPushToken(unreachable.device.id);

    clock.now += (IDLE_DAYS + 1) * DAY;
    expect(sessions.list().map((entry) => entry.id)).toEqual([told.device.id]);
    enrol(rae, "Rae's new iPhone");
    expect(stored(told.device.id)).toBeDefined();
    expect(stored(silent.device.id)).toBeUndefined();
    expect(stored(unreachable.device.id)).toBeUndefined();
  });

  it("stops at the absolute end all the same", () => {
    const { sessions, clock } = alerting();
    clock.now += ABSOLUTE_DAYS * DAY + 1;
    expect(sessions.alertTargets(null)).toEqual([]);
    expect(sessions.list()).toEqual([]);
  });
});

it("notes when alerts last reached a phone", () => {
  const { sessions, clock, phone } = alerting();
  clock.now += 3_600_000;
  sessions.alerted([phone.device.id, "opd_unknown"]);
  expect(sessions.alerts(phone.session()).lastAlertAt).toBe("2026-11-21T10:00:00.000Z");
});

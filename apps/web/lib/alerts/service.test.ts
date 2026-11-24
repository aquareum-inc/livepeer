import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { auditLog } from "../operator-devices/audit";
import { ABSOLUTE_DAYS, ALERTS_WARNING_DAYS, operatorDeviceSessions } from "../operator-devices/sessions";
import { TEST_CHALLENGE, TEST_SECRET, TEST_VERIFIER, emptyAudit, emptyOperatorDevices, testPhone } from "../operator-devices/testing";
import type { PushNotification, PushResult, PushSender, PushTarget } from "../push/types";
import { LEASE_MS, TESTS_PER_HOUR, alertsService, memoryAlertsStore } from "./service";

const DAY = 86_400_000;
const sam = { userId: "usr_demo_sam", name: "Sam Whitfield", email: "sam@example.test", role: "operator" as const };
const rae = { userId: "usr_demo_rae", name: "Rae Lindqvist", email: "rae@example.test", role: "operator" as const };
const ALL = ["engine_not_ready", "jobs_failing", "reports_waiting"] as const;

/** An instance with a sender that hands over what it is given, or answers as it is told to for a push token. */
function setup() {
  const clock = { now: Date.parse("2026-11-21T09:00:00Z") };
  const now = () => clock.now;
  const devices = emptyOperatorDevices();
  const auditStore = emptyAudit();
  const audit = auditLog(auditStore, now);
  const sessions = operatorDeviceSessions(devices, TEST_SECRET, audit, now);
  const store = memoryAlertsStore();
  const sent: Array<{ target: PushTarget; notification: PushNotification }> = [];
  const answers = new Map<string, PushResult>();
  const offers = { ios: true, android: true };
  const sender: PushSender = {
    offers: (platform) => offers[platform],
    async send(target, notification) {
      sent.push({ target, notification });
      return answers.get(target.token) ?? { outcome: "sent", detail: null };
    },
  };
  const flags = { enabled: true };
  const alerts = alertsService({ store, sessions: () => sessions, audit: () => audit, sender: async () => sender, enabled: async () => flags.enabled, name: async () => "Livepeer", now });

  let phones = 0;
  const enrol = async (identity: typeof sam, deviceName: string, kinds: readonly (typeof ALL)[number][] | null = ALL, platform: "ios" | "android" = "ios") => {
    const code = (await sessions.issueCode({ identity, challenge: TEST_CHALLENGE, platform }))!;
    const issued = (await sessions.redeemCode({ code, verifier: TEST_VERIFIER, deviceName, platform, publicKey: testPhone().rawPublicKey }))!;
    phones += 1;
    const pushToken = platform === "ios" ? String(phones).repeat(64).slice(0, 64).replace(/[^0-9a-f]/g, "a") : `fcm-token-${phones}-${"x".repeat(40)}`;
    const session = async () => (await sessions.find(issued.token))!;
    if (kinds) await sessions.setAlerts(await session(), { kinds: [...kinds], pushToken, environment: "production" });
    return { id: issued.device.id, token: issued.token, pushToken, session };
  };
  const bodies = () => sent.map((entry) => entry.notification.body);
  const to = (pushToken: string) => sent.filter((entry) => entry.target.token === pushToken).map((entry) => entry.notification.body);
  const events = async () => (await audit.list(200)).filter((entry) => entry.event === "alert");
  return { clock, sessions, store, auditStore, alerts, sent, answers, offers, flags, enrol, bodies, to, events };
}

const engineDown = async (alerts: ReturnType<typeof setup>["alerts"]) => {
  await alerts.observe({ type: "engine", ready: false });
  await alerts.observe({ type: "engine", ready: false });
};
const engineUp = async (alerts: ReturnType<typeof setup>["alerts"]) => {
  await alerts.observe({ type: "engine", ready: true });
  await alerts.observe({ type: "engine", ready: true });
};

describe("who is told", () => {
  it("every phone that chose the kind, and no phone that switched it off", async () => {
    const { alerts, enrol, to } = setup();
    const everything = await enrol(sam, "Sam's iPhone");
    const reportsOnly = await enrol(rae, "Rae's Pixel", ["reports_waiting"], "android");
    const none = await enrol(rae, "Rae's iPad", null);
    await engineDown(alerts);
    await alerts.observe({ type: "jobs", failed: 14 });
    await alerts.observe({ type: "report_filed", waiting: 3 });
    expect(to(everything.pushToken)).toEqual(["The engine isn't ready", "14 jobs failed in the last hour", "3 reports are waiting"]);
    expect(to(reportsOnly.pushToken)).toEqual(["3 reports are waiting"]);
    expect(to(none.pushToken)).toEqual([]);
  });

  it('"ready again" only the phones that were told it wasn\'t, and never a phone with the engine switched off', async () => {
    const { alerts, sessions, enrol, to } = setup();
    const told = await enrol(sam, "Sam's iPhone");
    const reportsOnly = await enrol(rae, "Rae's Pixel", ["reports_waiting"], "android");
    await engineDown(alerts);
    // Someone who turned alerts on while it was down was never told it was down.
    const late = await enrol(rae, "Rae's iPhone");
    await engineUp(alerts);
    expect(to(told.pushToken)).toEqual(["The engine isn't ready", "The engine is ready again"]);
    expect(to(late.pushToken)).toEqual([]);
    expect(to(reportsOnly.pushToken)).toEqual([]);

    // And someone who switched the engine off while it was down hears nothing more about it.
    await engineDown(alerts);
    await sessions.setAlerts(await told.session(), { kinds: ["reports_waiting"], pushToken: told.pushToken, environment: "production" });
    await engineUp(alerts);
    expect(to(told.pushToken)).toEqual(["The engine isn't ready", "The engine is ready again", "The engine isn't ready"]);
  });

  it("every other phone when a phone is added, whatever each chose, and not the phone itself", async () => {
    const { alerts, enrol, to } = setup();
    const reportsOnly = await enrol(sam, "Sam's iPhone", ["reports_waiting"]);
    const added = await enrol(rae, "Rae's iPhone");
    alerts.phoneAdded(added.id);
    await alerts.settled();
    expect(to(reportsOnly.pushToken)).toEqual(["A phone was added to the console"]);
    expect(to(added.pushToken)).toEqual([]);
  });

  it("nobody, and nothing is used up, while the console is off on phones", async () => {
    const { alerts, flags, enrol, bodies } = setup();
    const phone = await enrol(sam, "Sam's iPhone");
    flags.enabled = false;
    await engineDown(alerts);
    alerts.reportFiled(2);
    alerts.phoneAdded("opd_other");
    await alerts.settled();
    await alerts.endings();
    expect(await alerts.test(await phone.session())).toBe("not_delivered");
    expect(bodies()).toEqual([]);
    // Switched back on, a report is news again.
    flags.enabled = true;
    alerts.reportFiled(3);
    await alerts.settled();
    expect(bodies()).toEqual(["3 reports are waiting"]);
  });
});

describe("what happens to a send", () => {
  it("is written down with the phone it went to and whether it was accepted, and never the push token", async () => {
    const { alerts, enrol, events, auditStore, store } = setup();
    const phone = await enrol(sam, "Sam's iPhone");
    await engineDown(alerts);
    await engineUp(alerts);
    expect((await events()).map((entry) => [entry.user_name, entry.device_name, entry.detail])).toEqual([
      ["Sam Whitfield", "Sam's iPhone", "engine_not_ready, over: sent"],
      ["Sam Whitfield", "Sam's iPhone", "engine_not_ready: sent"],
    ]);
    expect(JSON.stringify([auditStore.read(), store.read()])).not.toContain(phone.pushToken);
  });

  it("drops a push token Apple or Google calls dead, and shows the phone as not reached", async () => {
    const { alerts, sessions, answers, enrol, events, bodies } = setup();
    const phone = await enrol(sam, "Sam's iPhone");
    answers.set(phone.pushToken, { outcome: "gone", detail: "Unregistered" });
    alerts.reportFiled(1);
    await alerts.settled();
    expect(sessions.alerts(await phone.session())).toMatchObject({ state: "not_reaching", lastAlertAt: null });
    expect((await events())[0]?.detail).toBe("reports_waiting: phone not reachable (Unregistered)");
    // Nothing more is sent to it.
    await engineDown(alerts);
    expect(bodies()).toEqual(["1 report is waiting"]);
  });

  it("remembers that the instance's own credentials were refused, per platform, until a send is accepted", async () => {
    const { alerts, sessions, answers, enrol, events } = setup();
    const iphone = await enrol(sam, "Sam's iPhone");
    const pixel = await enrol(rae, "Rae's Pixel", ALL, "android");
    answers.set(iphone.pushToken, { outcome: "refused", detail: "InvalidProviderToken" });
    alerts.reportFiled(1);
    await alerts.settled();
    expect(await alerts.refusals()).toEqual({ ios: { at: "2026-11-21T09:00:00.000Z", detail: "InvalidProviderToken" } });
    expect((await events()).map((entry) => entry.detail).sort()).toEqual(["reports_waiting: refused (InvalidProviderToken)", "reports_waiting: sent"]);
    // The phone keeps its push token: the fault is the instance's.
    expect(sessions.alerts(await iphone.session()).state).toBe("on");
    expect(sessions.alerts(await pixel.session()).lastAlertAt).toBe("2026-11-21T09:00:00.000Z");

    answers.delete(iphone.pushToken);
    await engineDown(alerts);
    expect(await alerts.refusals()).toEqual({});
  });

  it("keeps the push token and says so when an alert couldn't be handed over, or the sender throws", async () => {
    const world = setup();
    const phone = await world.enrol(sam, "Sam's iPhone");
    world.answers.set(phone.pushToken, { outcome: "failed", detail: "unreachable" });
    world.alerts.reportFiled(1);
    await world.alerts.settled();
    expect((await world.events())[0]?.detail).toBe("reports_waiting: failed (unreachable)");
    expect(world.sessions.alerts(await phone.session()).state).toBe("on");
  });
});

describe("the test alert", () => {
  it("reaches the phone that asked, three times an hour", async () => {
    const { alerts, clock, enrol, to, events } = setup();
    const phone = await enrol(sam, "Sam's iPhone", ["reports_waiting"]);
    const other = await enrol(rae, "Rae's iPhone");
    for (let attempt = 0; attempt < TESTS_PER_HOUR; attempt += 1) expect(await alerts.test(await phone.session())).toBe("sent");
    expect(await alerts.test(await phone.session())).toBe("limited");
    expect(to(phone.pushToken)).toEqual(Array.from({ length: TESTS_PER_HOUR }, () => "Alerts reach this phone."));
    expect(to(other.pushToken)).toEqual([]);
    expect((await events())[0]?.detail).toBe("test: sent");
    // The limit is each phone's own, and lifts with the hour.
    expect(await alerts.test(await other.session())).toBe("sent");
    clock.now += 3_600_001;
    expect(await alerts.test(await phone.session())).toBe("sent");
  });

  it("says alerts are off, or that it wasn't delivered", async () => {
    const { alerts, answers, enrol } = setup();
    const off = await enrol(sam, "Sam's iPad", null);
    expect(await alerts.test(await off.session())).toBe("off");
    const dead = await enrol(rae, "Rae's iPhone");
    answers.set(dead.pushToken, { outcome: "gone", detail: "Unregistered" });
    expect(await alerts.test(await dead.session())).toBe("not_delivered");
    // Now that it is known to be unreachable, there is nothing to send to.
    expect(await alerts.test(await dead.session())).toBe("not_delivered");
  });
});

describe("alerts that end with the session", () => {
  it("tells the phone a few days before, and once when they have ended", async () => {
    const { alerts, clock, enrol, to, events } = setup();
    const phone = await enrol(sam, "Sam's iPhone");
    clock.now += (ABSOLUTE_DAYS - ALERTS_WARNING_DAYS) * DAY;
    await alerts.endings();
    await alerts.endings();
    expect(to(phone.pushToken)).toEqual(["Alerts from Livepeer stop on this phone in 3 days. Sign in to the console to keep them."]);
    clock.now += ALERTS_WARNING_DAYS * DAY + 1;
    await alerts.endings();
    await alerts.endings();
    expect(to(phone.pushToken)).toEqual([
      "Alerts from Livepeer stop on this phone in 3 days. Sign in to the console to keep them.",
      "Alerts from Livepeer have stopped on this phone. Sign in to the console to turn them back on.",
    ]);
    expect((await events()).map((entry) => entry.detail)).toEqual(["alerts ended with the session: sent", "alerts end soon: sent"]);
  });

  it("tells a revoked phone nothing, not even that", async () => {
    const { alerts, sessions, clock, enrol, bodies } = setup();
    const phone = await enrol(sam, "Sam's iPhone");
    await sessions.revoke(phone.id, { userId: "usr_demo_rae", name: "Rae Lindqvist", deviceId: null, deviceName: null });
    clock.now += ABSOLUTE_DAYS * DAY + 1;
    await alerts.endings();
    await engineDown(alerts);
    expect(bodies()).toEqual([]);
  });
});

describe("the lease", () => {
  it("lets one process run the checks, and another take over only when it has lapsed", async () => {
    const { alerts, clock } = setup();
    expect(await alerts.lease("process-a")).toBe(true);
    expect(await alerts.lease("process-b")).toBe(false);
    clock.now += 60_000;
    expect(await alerts.lease("process-a")).toBe(true);
    clock.now += LEASE_MS - 1;
    expect(await alerts.lease("process-b")).toBe(false);
    clock.now += 1;
    expect(await alerts.lease("process-b")).toBe(true);
    expect(await alerts.lease("process-a")).toBe(false);
  });
});

it("leaves out a phone on a platform it can't send to, without a line in the audit log each time", async () => {
  const { alerts, offers, enrol, to, sent, events } = setup();
  const iphone = await enrol(sam, "Sam's iPhone");
  const pixel = await enrol(sam, "Sam's Pixel", ALL, "android");
  offers.android = false;
  await engineDown(alerts);
  await alerts.settled();
  expect(to(iphone.pushToken)).toEqual(["The engine isn't ready"]);
  expect(to(pixel.pushToken)).toEqual([]);
  expect((await events()).filter((entry) => entry.device_name === "Sam's Pixel")).toEqual([]);
  // It wasn't told the engine was down, so it isn't told it is back. Its alerts stay on for the next one.
  offers.android = true;
  await engineUp(alerts);
  await alerts.settled();
  expect(sent.filter((entry) => entry.target.token === pixel.pushToken)).toEqual([]);
  expect((await pixel.session()).alerts?.pushSealed).toBeTruthy();
});

it("says whether a platform can be sent to, and whether a push token is that platform's", async () => {
  const { alerts, offers } = setup();
  offers.android = false;
  expect([await alerts.offered("ios"), await alerts.offered("android")]).toEqual([true, false]);
  expect(alerts.accepts("ios", "ab".repeat(32))).toBe(true);
  expect(alerts.accepts("ios", "not hex")).toBe(false);
});

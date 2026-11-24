import "server-only";

import { memoryStore, type StateStore } from "../data/store";
import type { AuditLog } from "../operator-devices/audit";
import type { AlertTarget, OperatorDeviceSessions } from "../operator-devices/sessions";
import type { OperatorDeviceRecord } from "../operator-devices/store";
import type { AlertsAccess } from "../public-api/operations";
import { validPushToken, type PushNotification, type PushPlatform, type PushSender } from "../push/types";
import { alertNotification, endingNotification, testNotification } from "./compose";
import { decide, quietState, type Alert, type AlertState, type Observation } from "./decide";

/** Test alerts one phone may ask for in an hour. */
export const TESTS_PER_HOUR = 3;
/** How a test alert is named in the audit log. */
const TEST = "test";
/** How long a process keeps the right to run the watcher's checks without renewing it. */
export const LEASE_MS = 150_000;

/** What the instance keeps about its alerts, in DATA_DIR/operator-alerts.json. */
export interface AlertsContents {
  /** The one server process that runs the checks, and until when. Another takes over once this lapses. */
  lease: { holder: string; until: number } | null;
  state: AlertState;
  /** When Apple or Google last refused the instance's own credentials, for the System page. Cleared by a send they accept. */
  refused: Partial<Record<PushPlatform, { at: string; detail: string }>>;
}

export const emptyAlerts = (): AlertsContents => ({ lease: null, state: quietState(), refused: {} });

/** Where the instance keeps what it has noticed and said. One method per thing the alerts need of it. */
export interface AlertsStore {
  /** Takes the state through `change` as one step, and answers with whatever else `change` worked out. */
  advance<R>(change: (state: AlertState) => { state: AlertState; result: R }): Promise<R>;
  /** Notes which phones were told the engine isn't ready, so "ready again" goes to them and nobody else. */
  setEngineTold(sessionIds: string[]): Promise<void>;
  /** Gives or renews the right to run the checks. False while another holder's has not lapsed. */
  lease(holder: string, input: { now: number; until: number }): Promise<boolean>;
  refusals(): Promise<AlertsContents["refused"]>;
  /** Notes that a platform refused the instance's own credentials, or with null that it has accepted them since. */
  setRefusal(platform: PushPlatform, refusal: { at: string; detail: string } | null): Promise<void>;
}

/** Alerts kept as one document: a JSON file, or memory in tests. */
export function documentAlertsStore(document: StateStore<AlertsContents>): AlertsStore {
  return {
    async advance(change) {
      return document.update((contents) => {
        const next = change(contents.state);
        contents.state = next.state;
        return next.result;
      });
    },
    async setEngineTold(sessionIds) {
      document.update((contents) => {
        contents.state.engine.told = sessionIds;
      });
    },
    async lease(holder, { now, until }) {
      return document.update((contents) => {
        if (contents.lease && contents.lease.holder !== holder && contents.lease.until > now) return false;
        contents.lease = { holder, until };
        return true;
      });
    },
    async refusals() {
      return document.read().refused;
    },
    async setRefusal(platform, refusal) {
      document.update((contents) => {
        if (refusal) contents.refused[platform] = refusal;
        else delete contents.refused[platform];
      });
    },
  };
}

/** An empty store in memory, for tests. `read` is everything it holds. */
export function memoryAlertsStore() {
  const document = memoryStore<AlertsContents>(emptyAlerts());
  return { ...documentAlertsStore(document), read: () => document.read() };
}

export interface AlertsDependencies {
  store: AlertsStore;
  sessions: () => OperatorDeviceSessions;
  audit: () => AuditLog;
  sender: () => Promise<PushSender>;
  /** Whether the instance offers the console on phones. While it doesn't, nothing is sent. */
  enabled: () => Promise<boolean>;
  /** The instance's name: every notification's title. */
  name: () => Promise<string>;
  now?: () => number;
}

export interface Alerts extends AlertsAccess {
  /** Takes one observation through the rules and sends what they say to send. */
  observe(observation: Observation): Promise<void>;
  /** Tells phones whose alerts are about to end with their session, and those whose alerts just did. */
  endings(): Promise<void>;
  /** Whether this process may run the checks now: it holds the lease, or took it. */
  lease(holder: string): Promise<boolean>;
  /** When each platform's credentials were last refused. */
  refusals(): Promise<AlertsContents["refused"]>;
  /** Resolves when everything being sent has been handed over. */
  settled(): Promise<void>;
}

/**
 * The instance's alerts to operators' phones: the rules, who is told, and what happens to each send. Every
 * send is written to the audit log with the phone it went to; a push token never is.
 */
export function alertsService({ store, sessions, audit, sender, enabled, name, now = Date.now }: AlertsDependencies): Alerts {
  const sending = new Set<Promise<unknown>>();

  /** Sends one notification to one phone and deals with the answer. True when Apple or Google took it. */
  const send = async (target: AlertTarget, notification: PushNotification, what: string): Promise<boolean> => {
    const result = await (await sender())
      .send({ platform: target.platform, token: target.pushToken, environment: target.environment }, notification)
      .catch(() => ({ outcome: "failed" as const, detail: "unreachable" }));
    const actor = { userId: target.userId, name: target.name, deviceId: target.sessionId, deviceName: target.deviceName };
    await audit().write("alert", actor, { detail: `${what}: ${result.outcome === "sent" ? "sent" : `${result.outcome.replace("gone", "phone not reachable")}${result.detail ? ` (${result.detail})` : ""}`}`.slice(0, 200) });
    if (result.outcome === "gone") await sessions().dropPushToken(target.sessionId);
    if (result.outcome === "refused") await store.setRefusal(target.platform, { at: new Date(now()).toISOString(), detail: result.detail ?? "refused" });
    if (result.outcome === "sent") await store.setRefusal(target.platform, null);
    return result.outcome === "sent";
  };

  /** Sends to several phones at once and answers with the sessions that were reached. */
  const sendAll = async (targets: AlertTarget[], notification: (target: AlertTarget) => PushNotification, what: string): Promise<string[]> => {
    // A phone on a platform the instance holds no credentials for is left out: there is nothing to try, and a
    // line in the audit log for each alert would bury the ones that matter. System and the phone's own Alerts
    // page already say that platform isn't set up.
    const pushes = await sender();
    const offered = targets.filter((target) => pushes.offers(target.platform));
    const reached = (await Promise.all(offered.map(async (target) => ((await send(target, notification(target), what)) ? target.sessionId : null)))).filter((id): id is string => id !== null);
    await sessions().alerted(reached);
    return reached;
  };

  const deliver = async (alert: Alert, told: string[]): Promise<void> => {
    if (!(await enabled())) return;
    const targets = await sessions().alertTargets(alert.kind === "phone_added" ? null : alert.kind, { ...(alert.except ? { except: alert.except } : {}), ...(alert.over ? { only: told } : {}) });
    const title = await name();
    const reached = await sendAll(targets, () => alertNotification(title, alert), alert.over ? `${alert.kind}, over` : alert.kind);
    if (alert.kind !== "engine_not_ready") return;
    // "Ready again" goes only to the phones that were told it wasn't.
    await store.setEngineTold(alert.over ? [] : reached);
  };

  const observe = async (observation: Observation): Promise<void> => {
    // With the console off on phones nothing is noticed, so nothing is used up before it is switched back on.
    if (!(await enabled())) return;
    const step = await store.advance((state) => {
      const next = decide(state, observation, now());
      return { state: next.state, result: { alerts: next.alerts, told: state.engine.told } };
    });
    for (const alert of step.alerts) await deliver(alert, step.told);
  };

  /** Runs something without holding up the request that caused it, and never lets it fail that request. */
  const background = (work: Promise<unknown>): void => {
    const tracked = work.catch(() => undefined).finally(() => sending.delete(tracked));
    sending.add(tracked);
  };

  return {
    offered: async (platform) => (await sender()).offers(platform),
    accepts: validPushToken,
    reportFiled: (waiting) => background(observe({ type: "report_filed", waiting })),
    phoneAdded: (sessionId) => background(observe({ type: "phone_added", sessionId })),

    async test(session: OperatorDeviceRecord) {
      const alerts = sessions().alerts(session);
      if (alerts.state === "off") return "off";
      const [target] = await sessions().alertTargets(null, { only: [session.id] });
      if (!(await enabled()) || !target) return "not_delivered";
      const title = await name();
      // Every test sent, or tried, is in the audit log, so the log is the count: no process has to remember it.
      if ((await audit().alertsSince(session.id, TEST, now() - 3600_000)) >= TESTS_PER_HOUR) return "limited";
      return (await sendAll([target], () => testNotification(title), TEST)).length > 0 ? "sent" : "not_delivered";
    },

    observe,

    async endings() {
      if (!(await enabled())) return;
      const { warn, ended } = await sessions().alertEndings();
      const days = new Map(warn.map((target) => [target.sessionId, target.daysLeft]));
      const title = await name();
      await sendAll(warn, (target) => endingNotification(title, days.get(target.sessionId) ?? 1), "alerts end soon");
      // Not `sendAll`: these sessions are over, and there is nothing left to note on them.
      await Promise.all(ended.map((target) => send(target, endingNotification(title, null), "alerts ended with the session")));
    },

    lease: (holder) => store.lease(holder, { now: now(), until: now() + LEASE_MS }),

    refusals: () => store.refusals(),

    async settled() {
      while (sending.size > 0) await Promise.all([...sending]);
    },
  };
}

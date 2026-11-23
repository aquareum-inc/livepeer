import "server-only";

import type { StateStore } from "../data/store";
import type { AuditLog } from "../operator-devices/audit";
import type { AlertTarget, OperatorDeviceSessions } from "../operator-devices/sessions";
import type { OperatorDeviceRecord } from "../operator-devices/store";
import type { AlertsAccess } from "../public-api/operations";
import { validPushToken, type PushNotification, type PushPlatform, type PushSender } from "../push/types";
import { alertNotification, endingNotification, testNotification } from "./compose";
import { decide, quietState, type Alert, type AlertState, type Observation } from "./decide";

/** Test alerts one phone may ask for in an hour. */
export const TESTS_PER_HOUR = 3;
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

export type AlertsStore = StateStore<AlertsContents>;

export const emptyAlerts = (): AlertsContents => ({ lease: null, state: quietState(), refused: {} });

export interface AlertsDependencies {
  store: AlertsStore;
  sessions: () => OperatorDeviceSessions;
  audit: () => AuditLog;
  sender: () => PushSender;
  /** Whether the instance offers the console on phones. While it doesn't, nothing is sent. */
  enabled: () => boolean;
  /** The instance's name: every notification's title. */
  name: () => string;
  now?: () => number;
}

export interface Alerts extends AlertsAccess {
  /** Takes one observation through the rules and sends what they say to send. */
  observe(observation: Observation): Promise<void>;
  /** Tells phones whose alerts are about to end with their session, and those whose alerts just did. */
  endings(): Promise<void>;
  /** Whether this process may run the checks now: it holds the lease, or took it. */
  lease(holder: string): boolean;
  /** When each platform's credentials were last refused. */
  refusals(): AlertsContents["refused"];
  /** Resolves when everything being sent has been handed over. */
  settled(): Promise<void>;
}

/**
 * The instance's alerts to operators' phones: the rules, who is told, and what happens to each send. Every
 * send is written to the audit log with the phone it went to; a push token never is.
 */
export function alertsService({ store, sessions, audit, sender, enabled, name, now = Date.now }: AlertsDependencies): Alerts {
  const tests = new Map<string, number[]>();
  const sending = new Set<Promise<unknown>>();

  /** Sends one notification to one phone and deals with the answer. True when Apple or Google took it. */
  const send = async (target: AlertTarget, notification: PushNotification, what: string): Promise<boolean> => {
    const result = await sender()
      .send({ platform: target.platform, token: target.pushToken, environment: target.environment }, notification)
      .catch(() => ({ outcome: "failed" as const, detail: "unreachable" }));
    const actor = { userId: target.userId, name: target.name, deviceId: target.sessionId, deviceName: target.deviceName };
    audit().write("alert", actor, { detail: `${what}: ${result.outcome === "sent" ? "sent" : `${result.outcome.replace("gone", "phone not reachable")}${result.detail ? ` (${result.detail})` : ""}`}`.slice(0, 200) });
    if (result.outcome === "gone") sessions().dropPushToken(target.sessionId);
    if (result.outcome === "refused" || result.outcome === "sent") {
      store.update((contents) => {
        if (result.outcome === "refused") contents.refused[target.platform] = { at: new Date(now()).toISOString(), detail: result.detail ?? "refused" };
        else delete contents.refused[target.platform];
      });
    }
    return result.outcome === "sent";
  };

  /** Sends to several phones at once and answers with the sessions that were reached. */
  const sendAll = async (targets: AlertTarget[], notification: (target: AlertTarget) => PushNotification, what: string): Promise<string[]> => {
    // A phone on a platform the instance holds no credentials for is left out: there is nothing to try, and a
    // line in the audit log for each alert would bury the ones that matter. System and the phone's own Alerts
    // page already say that platform isn't set up.
    const offered = targets.filter((target) => sender().offers(target.platform));
    const reached = (await Promise.all(offered.map(async (target) => ((await send(target, notification(target), what)) ? target.sessionId : null)))).filter((id): id is string => id !== null);
    sessions().alerted(reached);
    return reached;
  };

  const deliver = async (alert: Alert, told: string[]): Promise<void> => {
    if (!enabled()) return;
    const targets = sessions().alertTargets(alert.kind === "phone_added" ? null : alert.kind, { ...(alert.except ? { except: alert.except } : {}), ...(alert.over ? { only: told } : {}) });
    const reached = await sendAll(targets, () => alertNotification(name(), alert), alert.over ? `${alert.kind}, over` : alert.kind);
    if (alert.kind !== "engine_not_ready") return;
    // "Ready again" goes only to the phones that were told it wasn't.
    store.update((contents) => {
      contents.state.engine.told = alert.over ? [] : reached;
    });
  };

  const observe = async (observation: Observation): Promise<void> => {
    // With the console off on phones nothing is noticed, so nothing is used up before it is switched back on.
    if (!enabled()) return;
    const step = store.update((contents) => {
      const told = contents.state.engine.told;
      const next = decide(contents.state, observation, now());
      contents.state = next.state;
      return { alerts: next.alerts, told };
    });
    for (const alert of step.alerts) await deliver(alert, step.told);
  };

  /** Runs something without holding up the request that caused it, and never lets it fail that request. */
  const background = (work: Promise<unknown>): void => {
    const tracked = work.catch(() => undefined).finally(() => sending.delete(tracked));
    sending.add(tracked);
  };

  return {
    offered: (platform) => sender().offers(platform),
    accepts: validPushToken,
    reportFiled: (waiting) => background(observe({ type: "report_filed", waiting })),
    phoneAdded: (sessionId) => background(observe({ type: "phone_added", sessionId })),

    async test(session: OperatorDeviceRecord) {
      const alerts = sessions().alerts(session);
      if (alerts.state === "off") return "off";
      const [target] = sessions().alertTargets(null, { only: [session.id] });
      if (!enabled() || !target) return "not_delivered";
      const recent = (tests.get(session.id) ?? []).filter((at) => now() - at < 3600_000);
      if (recent.length >= TESTS_PER_HOUR) return "limited";
      tests.set(session.id, [...recent, now()]);
      return (await sendAll([target], () => testNotification(name()), "test")).length > 0 ? "sent" : "not_delivered";
    },

    observe,

    async endings() {
      if (!enabled()) return;
      const { warn, ended } = sessions().alertEndings();
      const days = new Map(warn.map((target) => [target.sessionId, target.daysLeft]));
      await sendAll(warn, (target) => endingNotification(name(), days.get(target.sessionId) ?? 1), "alerts end soon");
      // Not `sendAll`: these sessions are over, and there is nothing left to note on them.
      await Promise.all(ended.map((target) => send(target, endingNotification(name(), null), "alerts ended with the session")));
    },

    lease(holder) {
      return store.update((contents) => {
        if (contents.lease && contents.lease.holder !== holder && contents.lease.until > now()) return false;
        contents.lease = { holder, until: now() + LEASE_MS };
        return true;
      });
    },

    refusals: () => store.read().refused,

    async settled() {
      while (sending.size > 0) await Promise.all([...sending]);
    },
  };
}

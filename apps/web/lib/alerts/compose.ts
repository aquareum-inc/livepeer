import type { PushNotification } from "../push/types";
import { ATTENTION } from "../public-api/operations";
import type { Alert } from "./decide";

const HOUR = 3600;

/**
 * Every notification the instance can send an operator's phone, built from a closed list of sentences. A
 * notification is read on a lock screen and passes through Apple and Google, so it says that something needs
 * the operator and where to look, with at most a count: never a name, an id, an error or an amount. Nothing
 * here takes free text.
 */
export function alertNotification(instanceName: string, alert: Alert): PushNotification {
  const title = instanceName;
  switch (alert.kind) {
    case "engine_not_ready":
      return alert.over
        ? { title, body: "The engine is ready again", kind: alert.kind, opens: "status", collapse: "console-engine_not_ready", lifeSeconds: HOUR, channel: "console_service", urgent: false }
        : { title, body: ATTENTION.engineNotReady, kind: alert.kind, opens: "status", collapse: "console-engine_not_ready", lifeSeconds: HOUR, channel: "console_service", urgent: true };
    case "jobs_failing":
      return { title, body: ATTENTION.jobsFailing(whole(alert.count)), kind: alert.kind, opens: "jobs", collapse: "console-jobs_failing", lifeSeconds: HOUR, channel: "console_service", urgent: false };
    case "reports_waiting":
      return { title, body: ATTENTION.reportsWaiting(whole(alert.count)), kind: alert.kind, opens: "reports", collapse: "console-reports_waiting", lifeSeconds: 12 * HOUR, channel: "console_reports", urgent: false };
    case "phone_added":
      return { title, body: "A phone was added to the console", kind: alert.kind, opens: "status", collapse: "console-phone_added", lifeSeconds: 12 * HOUR, channel: "console_sign_ins", urgent: false };
  }
}

/** What "Send a test alert" sends. */
export function testNotification(instanceName: string): PushNotification {
  return { title: instanceName, body: "Alerts reach this phone.", kind: "test", opens: "status", collapse: "console-test", lifeSeconds: HOUR, channel: "console_service", urgent: false };
}

/** Said a few days before a phone's alerts end with its session, and once when they have. */
export function endingNotification(instanceName: string, daysLeft: number | null): PushNotification {
  const days = daysLeft === null ? null : whole(daysLeft);
  const body =
    days === null
      ? `Alerts from ${instanceName} have stopped on this phone. Sign in to the console to turn them back on.`
      : `Alerts from ${instanceName} stop on this phone in ${days === 1 ? "1 day" : `${days} days`}. Sign in to the console to keep them.`;
  return { title: instanceName, body, kind: "session", opens: "status", collapse: "console-session", lifeSeconds: 24 * HOUR, channel: "console_sign_ins", urgent: false };
}

/** A count as a whole number of one or more: all that a sentence is given besides its own words. */
function whole(value: number | null): number {
  return Math.max(1, Math.trunc(Number(value) || 0));
}

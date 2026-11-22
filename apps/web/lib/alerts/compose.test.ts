import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { apnsPayload } from "../push/apns";
import { fcmMessage } from "../push/fcm";
import type { PushNotification } from "../push/types";
import { alertNotification, endingNotification, testNotification } from "./compose";
import type { Alert } from "./decide";

const NAME = "Livepeer";

/** Every notification the instance can send, over a spread of counts. */
function everything(): PushNotification[] {
  const kinds: Alert["kind"][] = ["engine_not_ready", "jobs_failing", "reports_waiting", "phone_added"];
  const counts = [null, 0, 1, 2, 14, 1500, -3, 2.7, Number.NaN];
  const alerts = kinds.flatMap((kind) => counts.flatMap((count) => [false, true].map((over): Alert => ({ kind, over, count, except: "opd_Xk2-secret-looking-id" }))));
  return [...alerts.map((alert) => alertNotification(NAME, alert)), testNotification(NAME), endingNotification(NAME, null), ...[1, 2, 3, 0, -1, 2.5].map((days) => endingNotification(NAME, days))];
}

/** The closed list of sentences. A notification's body is one of these and nothing else. */
const SENTENCES = [
  /^The engine isn't ready$/,
  /^The engine is ready again$/,
  /^(1 job|[1-9]\d* jobs) failed in the last hour$/,
  /^(1 report is|[1-9]\d* reports are) waiting$/,
  /^A phone was added to the console$/,
  /^Alerts reach this phone\.$/,
  /^Alerts from Livepeer stop on this phone in (1 day|[1-9]\d* days)\. Sign in to the console to keep them\.$/,
  /^Alerts from Livepeer have stopped on this phone\. Sign in to the console to turn them back on\.$/,
];

describe("what a notification may contain", () => {
  it("is the instance's name and one of a closed list of sentences, with at most a count", () => {
    for (const notification of everything()) {
      expect(notification.title).toBe(NAME);
      expect(SENTENCES.some((sentence) => sentence.test(notification.body)), notification.body).toBe(true);
      expect(["status", "jobs", "reports"]).toContain(notification.opens);
      expect(notification.collapse).toMatch(/^console-[a-z_]+$/);
      expect(notification.lifeSeconds).toBeGreaterThanOrEqual(3600);
    }
  });

  it("carries nothing but the words, the kind and where to look, on either platform", () => {
    for (const notification of everything()) {
      const ios = apnsPayload(notification);
      expect(Object.keys(ios).sort()).toEqual(["aps", "kind", "opens"]);
      expect(Object.keys(ios.aps as object).sort()).toEqual(notification.urgent ? ["alert", "interruption-level", "sound", "thread-id"] : ["alert", "sound", "thread-id"]);
      const android = (fcmMessage("a-push-token", notification) as { message: Record<string, unknown> }).message;
      expect(Object.keys(android).sort()).toEqual(["android", "data", "notification", "token"]);
      expect(android.data).toEqual({ kind: notification.kind, opens: notification.opens });
      // Nothing visible is silent, and nothing wakes the app to work unseen.
      const text = JSON.stringify([ios, android]);
      expect(text).not.toMatch(/content-available|mutable-content|content_available|https?:|opd_/);
    }
  });

  it("names nobody and nothing: no name, address, id, error, host or amount can reach a notification", () => {
    // What the instance knows while it is deciding what to send. None of it is an input to a sentence.
    const known = ["Dana Okafor", "dana@example.test", "usr_demo_dana", "Lumen", "rep_6b1f", "job_9c2e7f", "runner unreachable: ECONNREFUSED 10.0.4.7", "gpu-7.compute.example", "$1,204.50", "sexual", "this character is impersonating me"];
    const text = JSON.stringify(everything().flatMap((notification) => [apnsPayload(notification), fcmMessage("a-push-token", notification)]));
    for (const value of known) expect(text).not.toContain(value);
    expect(text).not.toMatch(/@|\$|usr_|rep_|job_|\d+\.\d+\.\d+\.\d+/);
  });

  it("lets only the engine being down break through, and keeps one line per kind", () => {
    const urgent = everything().filter((notification) => notification.urgent);
    expect(new Set(urgent.map((notification) => notification.body))).toEqual(new Set(["The engine isn't ready"]));
    const down = alertNotification(NAME, { kind: "engine_not_ready", over: false, count: null, except: null });
    const up = alertNotification(NAME, { kind: "engine_not_ready", over: true, count: null, except: null });
    // "Ready again" replaces "isn't ready" on the phone rather than sitting under it.
    expect(up.collapse).toBe(down.collapse);
    expect([down.lifeSeconds, alertNotification(NAME, { kind: "reports_waiting", over: false, count: 2, except: null }).lifeSeconds]).toEqual([3600, 12 * 3600]);
  });

  it("puts each kind in the Android channel a person would look for it in", () => {
    const channel = (kind: Alert["kind"]) => alertNotification(NAME, { kind, over: false, count: 1, except: null }).channel;
    expect([channel("engine_not_ready"), channel("jobs_failing"), channel("reports_waiting"), channel("phone_added")]).toEqual(["console_service", "console_service", "console_reports", "console_sign_ins"]);
  });
});

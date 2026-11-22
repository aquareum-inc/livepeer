import "server-only";

import { randomUUID } from "node:crypto";

import { moderation } from "../moderation";
import { buildReaderClient } from "../operator/client";
import { mobileConsoleEnabled, operatorDevices } from "../operator-devices";
import { FAILURES_WINDOW, failedInLastHour } from "../public-api/operations";
import { alerts } from "./index";

/** How often the engine is asked whether it is ready. */
export const CHECK_MS = 60_000;
/** How often recent jobs are read for failures. */
export const JOBS_EVERY_MS = 5 * 60_000;
/** An engine that hasn't answered in this long counts as not ready. */
const ANSWER_MS = 10_000;

const answered = <T>(work: Promise<T>): Promise<T> => Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("no answer")), ANSWER_MS).unref())]);

interface Watcher {
  holder: string;
  jobsReadAt: number;
  checking: boolean;
}

/**
 * One round of checks, for whoever is listening. It does nothing while the console isn't offered on phones or
 * no phone has alerts on, and nothing in a process that doesn't hold the lease. It reads the engine with the
 * reader token only, through the same client functions the console's pages use, and takes nothing from a request.
 */
export async function check(watcher: Watcher, now: number = Date.now()): Promise<void> {
  if (!mobileConsoleEnabled() || !operatorDevices().anyAlerts()) return;
  const service = alerts();
  if (!service.lease(watcher.holder)) return;
  const client = buildReaderClient();

  // An engine that can't be reached is not ready, whatever the reason.
  const ready = await answered(client.getEngineHealth()).then((health) => health.data.ready, () => false);
  await service.observe({ type: "engine", ready });

  if (now - watcher.jobsReadAt >= JOBS_EVERY_MS) {
    const jobs = await answered(client.listJobs(FAILURES_WINDOW)).then((list) => list.data, () => null);
    if (jobs) {
      watcher.jobsReadAt = now;
      await service.observe({ type: "jobs", failed: failedInLastHour(jobs, now) });
    }
  }

  await service.observe({ type: "reports", waiting: moderation().reports().filter((report) => report.state === "open").length });
  await service.endings();
}

const started = globalThis as { livepeerAlertWatcher?: NodeJS.Timeout };

/**
 * Starts the watcher: the one thing in the instance that runs between requests. Once per process, however
 * often a development server reloads this module. A round that fails is tried again a minute later; a round
 * still running when the next is due is left to finish.
 */
export function startAlertWatcher(): void {
  if (started.livepeerAlertWatcher) return;
  const watcher: Watcher = { holder: randomUUID(), jobsReadAt: 0, checking: false };
  started.livepeerAlertWatcher = setInterval(() => {
    if (watcher.checking) return;
    watcher.checking = true;
    void check(watcher)
      .catch(() => undefined)
      .finally(() => {
        watcher.checking = false;
      });
  }, CHECK_MS);
  started.livepeerAlertWatcher.unref();
}

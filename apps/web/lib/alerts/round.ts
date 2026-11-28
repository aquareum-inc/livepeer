import "server-only";

import { devices } from "../devices";
import { env } from "../env";
import { media } from "../media";
import { moderation } from "../moderation";
import { buildReaderClient } from "../operator/client";
import { mobileConsoleEnabled, operatorDevices } from "../operator-devices";
import { operators } from "../operators";
import { FAILURES_WINDOW, failedInLastHour } from "../public-api/operations";
import { alerts } from "./index";

/** How often recent jobs are read for failures. */
export const JOBS_EVERY_MS = 5 * 60_000;
/** An engine that hasn't answered in this long counts as not ready. */
const ANSWER_MS = 10_000;
/** With no round in this long, nothing is running the checks. */
export const ROUND_OVERDUE_MS = 5 * 60_000;
/** How long a server that runs the rounds itself is given to run its first. */
const STARTING_MS = 90_000;

const answered = <T>(work: Promise<T>): Promise<T> => Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("no answer")), ANSWER_MS).unref())]);

/**
 * One round of the instance's own housekeeping and checks, for whoever is listening. Anything may ask for
 * it: the timer of a server that stays running, a scheduler calling `/api/cron/alerts`, or both, on one
 * server or several. A round is started at most once in a little under a minute whoever asks, and it keeps
 * nothing in memory, so it runs the same in a function that has just started. It reads the engine with the
 * reader token only, through the same client functions the console's pages use, and takes nothing from a
 * request. Answers with whether this call was the one that ran.
 */
export async function runAlertRound(): Promise<boolean> {
  const now = Date.now();
  const service = alerts();
  const round = await service.claimRound();
  if (!round) return false;

  // What has lapsed goes here, so nothing waits for the next sign-in to be tidied.
  await Promise.all([devices().sweep(), operatorDevices().sweep(), operators().sweep()]);
  // Uploads that were asked for and never finished. Storage not answering must not stop the checks.
  await media().sweep().catch(() => 0);

  // With the console off on phones, or no phone listening, there is nobody to tell and nothing is asked.
  if (!(await mobileConsoleEnabled()) || !(await operatorDevices().anyAlerts())) return true;
  const client = await buildReaderClient();

  // An engine that can't be reached is not ready, whatever the reason.
  const ready = await answered(client.getEngineHealth()).then((health) => health.data.ready, () => false);
  await service.observe({ type: "engine", ready });

  if (round.jobsReadAt === null || now - round.jobsReadAt >= JOBS_EVERY_MS) {
    const jobs = await answered(client.listJobs(FAILURES_WINDOW)).then((list) => list.data, () => null);
    if (jobs) {
      await service.jobsRead();
      await service.observe({ type: "jobs", failed: failedInLastHour(jobs, now) });
    }
  }

  await service.observe({ type: "reports", waiting: (await moderation().reports()).filter((report) => report.state === "open").length });
  await service.endings();
  return true;
}

/** Where the checks stand, for the System page, `doctor` and the health check. */
export type RoundStatus = "off" | "running" | "starting" | "overdue";

/**
 * Whether anything is running the rounds. They matter only while the console is offered on phones. Five
 * minutes without one means no timer is running and no scheduler is calling. A server that runs them itself
 * and has only just started is given a moment for its first; where a scheduler runs them (CRON_SECRET is
 * set) there is no such moment, since how long this process has been up says nothing about the scheduler.
 */
export async function roundStatus(now: number = Date.now()): Promise<{ status: RoundStatus; lastAt: number | null }> {
  if (!(await mobileConsoleEnabled())) return { status: "off", lastAt: null };
  const lastAt = await alerts().lastRoundAt();
  if (lastAt !== null && now - lastAt < ROUND_OVERDUE_MS) return { status: "running", lastAt };
  return { status: !env("CRON_SECRET") && process.uptime() * 1000 < STARTING_MS ? "starting" : "overdue", lastAt };
}

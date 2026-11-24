import "server-only";

import { env } from "../env";
import { runAlertRound } from "./round";

/** How often a server that stays running asks for a round. */
export const CHECK_MS = 60_000;
/** How long after starting it asks for its first, so the checks are known to be running without a minute's wait. */
const FIRST_MS = 5_000;

const started = globalThis as { livepeerAlertWatcher?: NodeJS.Timeout };

/**
 * Starts the timer that asks for a round each minute: the one thing in the instance that runs between
 * requests, on a host where a process stays up between them. Once per process, however often a development
 * server reloads this module. A round that fails is tried again a minute later; one still running when the
 * next is due is left to finish.
 *
 * With CRON_SECRET set, a scheduler runs the rounds through `/api/cron/alerts` and no timer is started: that
 * is how an instance says it is on a host with no server between requests, without the host being guessed.
 */
export function startAlertWatcher(): void {
  if (started.livepeerAlertWatcher || env("CRON_SECRET")) return;
  let running = false;
  const round = (): void => {
    if (running) return;
    running = true;
    void runAlertRound()
      .catch(() => undefined)
      .finally(() => {
        running = false;
      });
  };
  setTimeout(round, FIRST_MS).unref();
  started.livepeerAlertWatcher = setInterval(round, CHECK_MS);
  started.livepeerAlertWatcher.unref();
}

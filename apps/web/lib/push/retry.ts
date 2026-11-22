import type { PushResult } from "./types";

/** One attempt at a send: finished, or worth another go because the service was busy or unreachable. */
export type Attempt = PushResult | { outcome: "again"; detail: string | null };

/** How long to wait before the second and third attempts. */
const WAITS_MS = [1_000, 3_000];

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Tries a send up to three times. Nothing is queued beyond that: an alert that can't be handed over is lost, and said to be. */
export async function withRetries(attempt: () => Promise<Attempt>, wait: (ms: number) => Promise<void> = sleep): Promise<PushResult> {
  let last: string | null = null;
  for (let tries = 0; tries <= WAITS_MS.length; tries += 1) {
    if (tries > 0) await wait(WAITS_MS[tries - 1] as number);
    let result: Attempt;
    try {
      result = await attempt();
    } catch {
      result = { outcome: "again", detail: "unreachable" };
    }
    if (result.outcome !== "again") return result;
    last = result.detail;
  }
  return { outcome: "failed", detail: last };
}

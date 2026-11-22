import type { OperatorAlertKind } from "@livepeer/api-client";

import { FAILING_JOBS } from "../public-api/operations";

/** The engine must answer the same way on this many checks in a row before anyone is told, so a restart pages nobody. */
export const ENGINE_CHECKS = 2;
/** Failing jobs can alert again only after Status has not listed them for this long. */
export const JOBS_CLEAR_MS = 30 * 60_000;
/** While reports are waiting, phones are told of more at most this often. */
export const REPORTS_EVERY_MS = 60 * 60_000;

/** What is wrong right now and what has been said about it. Kept on disk, so a restart doesn't say it all again. */
export interface AlertState {
  engine: {
    /** Whether phones have been told the engine isn't ready. */
    down: boolean;
    /** Checks in a row that disagree with `down`. */
    streak: number;
    /** The phones that were told, so "ready again" goes to them and nobody else. */
    told: string[];
  };
  jobs: { failing: boolean; lastSeenAt: number | null };
  reports: {
    /** When phones were last told while reports have been waiting. Null once the queue has emptied. */
    lastSentAt: number | null;
    /** Reports were filed since then that nobody has been told about. */
    unannounced: boolean;
  };
}

export const quietState = (): AlertState => ({ engine: { down: false, streak: 0, told: [] }, jobs: { failing: false, lastSeenAt: null }, reports: { lastSentAt: null, unannounced: false } });

/** One thing the instance noticed: on the watcher's checks, or as it happened. */
export type Observation =
  | { type: "engine"; ready: boolean }
  /** How many jobs failed in the last hour. */
  | { type: "jobs"; failed: number }
  /** A new report was filed, and this many are waiting now. */
  | { type: "report_filed"; waiting: number }
  /** How many reports are waiting, on a check. */
  | { type: "reports"; waiting: number }
  | { type: "phone_added"; sessionId: string };

/** Something to tell phones. It carries a kind and at most a count: the words are composed from those alone. */
export interface Alert {
  kind: OperatorAlertKind | "phone_added";
  /** The engine is ready again. */
  over: boolean;
  count: number | null;
  /** A session that isn't told: the phone that was just added. */
  except: string | null;
}

const alert = (kind: Alert["kind"], fields: Partial<Alert> = {}): Alert => ({ kind, over: false, count: null, except: null, ...fields });

/**
 * The rules of section 18.9 of docs/mobile/plan.md, as one step: what was known, one observation, what is
 * known now and what to send. An alert is sent when something starts, never for as long as it lasts.
 */
export function decide(previous: AlertState, observation: Observation, now: number): { state: AlertState; alerts: Alert[] } {
  const state = structuredClone(previous);
  switch (observation.type) {
    case "engine": {
      // An answer that agrees with what phones were last told changes nothing and ends any run against it.
      if (observation.ready !== state.engine.down) {
        state.engine.streak = 0;
        return { state, alerts: [] };
      }
      state.engine.streak += 1;
      if (state.engine.streak < ENGINE_CHECKS) return { state, alerts: [] };
      state.engine.streak = 0;
      state.engine.down = !observation.ready;
      return { state, alerts: [alert("engine_not_ready", { over: observation.ready })] };
    }
    case "jobs": {
      if (observation.failed >= FAILING_JOBS) {
        const started = !state.jobs.failing;
        state.jobs = { failing: true, lastSeenAt: now };
        return { state, alerts: started ? [alert("jobs_failing", { count: observation.failed })] : [] };
      }
      if (state.jobs.failing && state.jobs.lastSeenAt !== null && now - state.jobs.lastSeenAt >= JOBS_CLEAR_MS) state.jobs = { failing: false, lastSeenAt: null };
      return { state, alerts: [] };
    }
    case "report_filed": {
      if (state.reports.lastSentAt === null || now - state.reports.lastSentAt >= REPORTS_EVERY_MS) {
        state.reports = { lastSentAt: now, unannounced: false };
        return { state, alerts: [alert("reports_waiting", { count: observation.waiting })] };
      }
      state.reports.unannounced = true;
      return { state, alerts: [] };
    }
    case "reports": {
      if (observation.waiting === 0) {
        state.reports = { lastSentAt: null, unannounced: false };
        return { state, alerts: [] };
      }
      // Reports filed inside the hour are said together once the hour is up.
      if (state.reports.unannounced && state.reports.lastSentAt !== null && now - state.reports.lastSentAt >= REPORTS_EVERY_MS) {
        state.reports = { lastSentAt: now, unannounced: false };
        return { state, alerts: [alert("reports_waiting", { count: observation.waiting })] };
      }
      return { state, alerts: [] };
    }
    case "phone_added":
      return { state, alerts: [alert("phone_added", { except: observation.sessionId })] };
  }
}

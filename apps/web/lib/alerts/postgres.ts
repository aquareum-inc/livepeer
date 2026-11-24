import "server-only";

import { and, eq, schema, sql, type Database } from "@livepeer/db";

import type { PushPlatform } from "../push/types";
import type { AlertState } from "./decide";
import type { AlertsStore } from "./service";

const { alertState, pushRefusals } = schema;
/** The one row of `alert_state`. */
const ONLY = "alerts";

const stateOf = (row: typeof alertState.$inferSelect): AlertState => ({
  engine: { down: row.engineDown, streak: row.engineStreak, told: row.engineTold },
  jobs: { failing: row.jobsFailing, lastSeenAt: row.jobsLastSeenAt?.getTime() ?? null },
  reports: { lastSentAt: row.reportsLastSentAt?.getTime() ?? null, unannounced: row.reportsUnannounced },
});

const when = (ms: number | null): Date | null => (ms === null ? null : new Date(ms));

/**
 * Alerts state in Postgres. A round of checks is claimed with one UPDATE that only moves the time forward
 * when the last round is old enough, so of two servers, a timer and a scheduler, or one call tried twice,
 * exactly one gets a row back. The rules are applied to the state inside a transaction that holds the row.
 */
export function postgresAlertsStore(db: Database): AlertsStore {
  /** The row exists from the first time anything asks for it. */
  const ensure = (from: Pick<Database, "insert"> = db) => from.insert(alertState).values({ id: ONLY }).onConflictDoNothing();

  return {
    async advance(change) {
      return db.transaction(async (tx) => {
        await ensure(tx);
        const [row] = await tx.select().from(alertState).where(eq(alertState.id, ONLY)).for("update");
        if (!row) throw new Error("alert_state has no row");
        const next = change(stateOf(row));
        await tx
          .update(alertState)
          .set({
            engineDown: next.state.engine.down,
            engineStreak: next.state.engine.streak,
            engineTold: next.state.engine.told,
            jobsFailing: next.state.jobs.failing,
            jobsLastSeenAt: when(next.state.jobs.lastSeenAt),
            reportsLastSentAt: when(next.state.reports.lastSentAt),
            reportsUnannounced: next.state.reports.unannounced,
          })
          .where(eq(alertState.id, ONLY));
        return next.result;
      });
    },
    async setEngineTold(sessionIds) {
      await ensure();
      await db.update(alertState).set({ engineTold: sessionIds }).where(eq(alertState.id, ONLY));
    },
    async claimRound(now, every) {
      await ensure();
      const [row] = await db
        .update(alertState)
        .set({ roundClaimedAt: new Date(now) })
        .where(and(eq(alertState.id, ONLY), sql`(${alertState.roundClaimedAt} is null or ${alertState.roundClaimedAt} <= ${new Date(now - every).toISOString()}::timestamptz)`))
        .returning({ jobsReadAt: alertState.jobsReadAt });
      return row ? { jobsReadAt: row.jobsReadAt?.getTime() ?? null } : null;
    },
    async jobsRead(at) {
      await ensure();
      await db.update(alertState).set({ jobsReadAt: new Date(at) }).where(eq(alertState.id, ONLY));
    },
    async lastRoundAt() {
      const [row] = await db.select({ at: alertState.roundClaimedAt }).from(alertState).where(eq(alertState.id, ONLY));
      return row?.at?.getTime() ?? null;
    },
    async refusals() {
      const rows = await db.select().from(pushRefusals);
      return Object.fromEntries(rows.map((row) => [row.platform, { at: row.at.toISOString(), detail: row.detail }])) as Partial<Record<PushPlatform, { at: string; detail: string }>>;
    },
    async setRefusal(platform, refusal) {
      if (!refusal) {
        await db.delete(pushRefusals).where(eq(pushRefusals.platform, platform));
        return;
      }
      const values = { at: new Date(refusal.at), detail: refusal.detail };
      await db.insert(pushRefusals).values({ platform, ...values }).onConflictDoUpdate({ target: pushRefusals.platform, set: values });
    },
  };
}

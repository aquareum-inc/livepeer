import "server-only";

import type { ReportReason } from "@livepeer/api-client";
import { and, eq, schema, sql, type Database } from "@livepeer/db";

import type { ModerationStore, StoredReport } from "./moderation";

const { characterReports: reports, characterBlocks: blocks, hiddenCharacters: hidden } = schema;

/** What a report's sender is shown as once their account is gone, as the file store writes it. */
const DELETED = "deleted";

const stored = (row: typeof reports.$inferSelect): StoredReport => ({
  id: row.id,
  character_slug: row.characterSlug,
  character_name: row.characterName,
  author: row.author,
  reason: row.reason as ReportReason,
  note: row.note,
  created_at: row.createdAt.toISOString(),
  state: row.state,
  reporter: row.reporterId ?? DELETED,
});

/**
 * Reports, blocks and takedowns in Postgres. "One open report per person per character" is an index, so a
 * second report changes the first in one statement, and a takedown closes a character's other reports in
 * the same transaction that hides it.
 */
export function postgresModerationStore(db: Database): ModerationStore {
  return {
    async fileReport(report) {
      const [row] = await db
        .insert(reports)
        .values({ id: report.id, characterSlug: report.character_slug, characterName: report.character_name, author: report.author, reason: report.reason, note: report.note, state: report.state, reporterId: report.reporter, createdAt: new Date(report.created_at) })
        .onConflictDoUpdate({ target: [reports.reporterId, reports.characterSlug], targetWhere: sql`${reports.state} = 'open'`, set: { reason: report.reason, note: report.note } })
        .returning();
      return row ? stored(row) : report;
    },
    async reports() {
      return (await db.select().from(reports)).map(stored);
    },
    async resolve(id, outcome) {
      return db.transaction(async (tx) => {
        const [row] = await tx.update(reports).set({ state: outcome }).where(eq(reports.id, id)).returning();
        if (!row) return null;
        if (outcome === "hidden") {
          await tx.insert(hidden).values({ characterSlug: row.characterSlug }).onConflictDoNothing();
          await tx.update(reports).set({ state: "hidden" }).where(and(eq(reports.characterSlug, row.characterSlug), eq(reports.state, "open")));
        }
        return stored(row);
      });
    },
    async block(block) {
      await db.insert(blocks).values({ userId: block.userId, characterSlug: block.character_slug, author: block.author }).onConflictDoNothing();
    },
    async blocksOf(userId) {
      return (await db.select().from(blocks).where(eq(blocks.userId, userId))).map((row) => ({ userId: row.userId, character_slug: row.characterSlug, author: row.author }));
    },
    async hidden() {
      return (await db.select({ slug: hidden.characterSlug }).from(hidden)).map((row) => row.slug);
    },
    async forget(userId) {
      await db.transaction(async (tx) => {
        await tx.delete(blocks).where(eq(blocks.userId, userId));
        await tx.update(reports).set({ reporterId: null }).where(eq(reports.reporterId, userId));
      });
    },
  };
}

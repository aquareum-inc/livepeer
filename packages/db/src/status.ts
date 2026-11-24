import journal from "../migrations/meta/_journal.json";

/** The least of a connection this needs, so a pool, a single client and the in-process test database all fit. */
export interface Queryable {
  query(text: string): Promise<{ rows: unknown[] }>;
}

export type SchemaStatus = "ok" | "behind" | "unreachable";

/** Where drizzle's migrator records what it has applied. */
export const MIGRATIONS_TABLE = "drizzle.__drizzle_migrations";

/** The newest migration this checkout carries: its name, and the time the migrator records it under. */
export const HEAD: { tag: string; when: number } | null = journal.entries.at(-1) ?? null;

/**
 * Whether the database has every migration this code expects. A database that is ahead is fine: migrations
 * only add, so the release before the one that wrote them keeps working (expand, then contract).
 */
export async function schemaStatus(database: Queryable): Promise<SchemaStatus> {
  try {
    if (!HEAD) return "ok";
    const table = await database.query(`select to_regclass('${MIGRATIONS_TABLE}') as name`);
    if ((table.rows[0] as { name: string | null } | undefined)?.name == null) return "behind";
    const newest = await database.query(`select max(created_at) as at from ${MIGRATIONS_TABLE}`);
    const at = (newest.rows[0] as { at: string | number | null } | undefined)?.at;
    return at != null && Number(at) >= HEAD.when ? "ok" : "behind";
  } catch {
    return "unreachable";
  }
}

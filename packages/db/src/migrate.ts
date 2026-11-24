import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as apply } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import { MIGRATIONS_TABLE } from "./status";

/** Any number works, as long as every migration run asks for the same one. */
const LOCK = 7_316_402;

export interface MigrationResult {
  /** Migrations this run applied. Zero when the database was already current. */
  applied: number;
  /** Migrations the database has had in all. */
  total: number;
}

async function count(client: pg.Client): Promise<number> {
  const table = await client.query<{ name: string | null }>(`select to_regclass('${MIGRATIONS_TABLE}') as name`);
  if (table.rows[0]?.name == null) return 0;
  const rows = await client.query<{ total: string }>(`select count(*) as total from ${MIGRATIONS_TABLE}`);
  return Number(rows.rows[0]?.total ?? 0);
}

/**
 * Applies the migrations in `folder` that the database hasn't had. `url` must be a direct connection, not a
 * pooled one: the lock that stops two runs overlapping belongs to the session, and a transaction-mode pooler
 * gives each statement a different one. All pending migrations go in one transaction, so a failure leaves the
 * schema where it was.
 */
export async function migrate({ url, folder }: { url: string; folder: string }): Promise<MigrationResult> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK]);
    const before = await count(client);
    await apply(drizzle(client), { migrationsFolder: folder });
    const total = await count(client);
    return { applied: total - before, total };
  } finally {
    // Closing the session releases the lock, whether or not the run got as far as taking it.
    await client.end();
  }
}

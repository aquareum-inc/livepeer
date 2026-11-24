import path from "node:path";

import { getTableName, isTable, schema, sql, type Database } from "@livepeer/db";
import { openEmbedded, type Embedded } from "@livepeer/db/embedded";
import { afterAll, beforeAll } from "vitest";

const held = globalThis as typeof globalThis & { livepeerEmbedded?: Embedded };
const tables = Object.values(schema).filter(isTable);
const migrations = path.join(import.meta.dirname, "../../../../packages/db/migrations");

/**
 * Gives a test file the instance's database: a real Postgres in memory, at this release's schema, open for
 * as long as the file runs. Everything that asks for `database()` gets it, as on a server with no
 * DATABASE_URL. Call it once at the top of the file.
 */
export function useTestDatabase(): void {
  beforeAll(async () => {
    held.livepeerEmbedded = await openEmbedded({ migrations });
  });
  afterAll(async () => {
    await held.livepeerEmbedded?.close();
    delete held.livepeerEmbedded;
  });
}

/**
 * The same, for a file that builds what it tests as it loads, before any hook has run: `await` it at the top
 * and the database is already open on the next line.
 */
export async function openTestDatabase(): Promise<void> {
  held.livepeerEmbedded = await openEmbedded({ migrations });
  afterAll(async () => {
    await held.livepeerEmbedded?.close();
    delete held.livepeerEmbedded;
  });
}

/** The test file's database. */
export function testDatabase(): Database {
  if (!held.livepeerEmbedded) throw new Error("Call useTestDatabase() at the top of the test file.");
  return held.livepeerEmbedded.db;
}

/** Empties every table, for a test that starts from nothing. */
export async function emptyDatabase(): Promise<void> {
  await testDatabase().execute(sql.raw(`truncate ${tables.map((table) => `"${getTableName(table)}"`).join(", ")} restart identity cascade`));
}

/** Every row of every table as one string: what someone holding a copy of the database could read. */
export async function everythingKept(): Promise<string> {
  const db = testDatabase();
  return JSON.stringify(Object.fromEntries(await Promise.all(tables.map(async (table) => [getTableName(table), await db.select().from(table)]))));
}

/** Rows of one table, by its name, as they are kept. */
export async function rowsOf<T = Record<string, unknown>>(name: string): Promise<T[]> {
  const result = (await testDatabase().execute(sql.raw(`select * from "${name}"`))) as unknown as { rows: T[] };
  return result.rows;
}

import { mkdirSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "./database";
import * as schema from "./schema";
import type { Queryable } from "./status";

/** An embedded database, open and at this release's schema. */
export interface Embedded {
  db: Database;
  /** For the schema check, which asks in plain SQL. */
  client: Queryable;
  close: () => Promise<void>;
}

/**
 * A real Postgres inside this process, kept in a directory (or in memory with none), for an instance that
 * was given no database to connect to: development, tests, CI and a first look. It is brought to this
 * release's schema as it opens. One process may have a directory open at a time.
 */
export async function openEmbedded(options: { dir?: string; migrations: string }): Promise<Embedded> {
  if (options.dir) mkdirSync(options.dir, { recursive: true, mode: 0o700 });
  const client = new PGlite(options.dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: options.migrations });
  return { db, client, close: () => client.close() };
}

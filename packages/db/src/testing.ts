import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "./database";
import * as schema from "./schema";

/**
 * A real Postgres, in process and empty, brought to head with the committed migration files. For tests: no
 * Docker and no service to start. Close it when the test is done.
 */
export async function testDatabase(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, "../migrations") });
  return { db, close: () => client.close() };
}

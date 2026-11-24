import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";

import type { Pool } from "./pool";
import * as schema from "./schema";

/**
 * Typed queries over the instance's tables. Stores are written against this, not against a driver, so the
 * same store runs on a connection pool and on the in-process database the tests use.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function database(pool: Pool): Database {
  return drizzle(pool, { schema });
}

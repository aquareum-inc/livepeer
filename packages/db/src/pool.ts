import { attachDatabasePool } from "@vercel/functions";
import pg from "pg";

export type Pool = pg.Pool;

/** A serverless instance handles few requests at once, and a long-running server shares these between them. */
const MAX_CONNECTIONS = 5;

/**
 * The connections the app queries through, made once per process. On a serverless host the address is the
 * pooled one (PgBouncer in transaction mode), so nothing here may rely on session state: no LISTEN, no
 * session-level locks, no SET. Anything that must be atomic is one statement or one transaction.
 */
export function createPool(url: string): Pool {
  const pool = new pg.Pool({ connectionString: url, max: MAX_CONNECTIONS, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 });
  // An idle connection the server closed reports here. Without a listener it would take the process down;
  // the pool has already discarded it, and the next query opens another.
  pool.on("error", () => undefined);
  // On Vercel a suspended function must drop idle connections. Elsewhere this is a no-op.
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

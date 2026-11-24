import "server-only";

import { createPool, schemaStatus, type Pool, type SchemaStatus } from "@livepeer/db";

import { env } from "../env";

/** "none" is an instance with no DATABASE_URL: it keeps its state in files, for development and tests only. */
export type DatabaseStatus = SchemaStatus | "none";

// Kept on the global object so a development reload reuses the connections instead of leaking a pool each time.
const held = globalThis as typeof globalThis & { livepeerDatabase?: { url: string; pool: Pool } };

/**
 * The instance's database, or null when it has none. Whether DATABASE_URL is set is the one thing that decides
 * where the instance keeps its state, mock-only or not: a host with no disk needs a database either way.
 */
export function database(): Pool | null {
  const url = env("DATABASE_URL");
  if (!url) return null;
  if (held.livepeerDatabase?.url !== url) {
    void held.livepeerDatabase?.pool.end();
    held.livepeerDatabase = { url, pool: createPool(url) };
  }
  return held.livepeerDatabase.pool;
}

/** Whether the database can be reached and has every migration this release expects. */
export async function databaseStatus(): Promise<DatabaseStatus> {
  const pool = database();
  return pool ? schemaStatus(pool) : "none";
}

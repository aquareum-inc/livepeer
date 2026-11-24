import "server-only";

import { createPool, database as queries, schemaStatus, type Database, type Pool, type SchemaStatus } from "@livepeer/db";

import { env } from "../env";

/** "none" is an instance with no DATABASE_URL: it keeps its state in files, for development and tests only. */
export type DatabaseStatus = SchemaStatus | "none";

// Kept on the global object so a development reload reuses the connections instead of leaking a pool each time.
const held = globalThis as typeof globalThis & { livepeerDatabase?: { url: string; pool: Pool; db: Database } };

/**
 * The instance's database, or null when it has none. Whether DATABASE_URL is set is the one thing that decides
 * where the instance keeps its state, mock-only or not: a host with no disk needs a database either way.
 */
export function database(): Database | null {
  return connection()?.db ?? null;
}

function connection(): { pool: Pool; db: Database } | null {
  const url = env("DATABASE_URL");
  if (!url) return null;
  if (held.livepeerDatabase?.url !== url) {
    void held.livepeerDatabase?.pool.end();
    const pool = createPool(url);
    held.livepeerDatabase = { url, pool, db: queries(pool) };
  }
  return held.livepeerDatabase;
}

/** Whether the database can be reached and has every migration this release expects. */
export async function databaseStatus(): Promise<DatabaseStatus> {
  const pool = connection()?.pool;
  return pool ? schemaStatus(pool) : "none";
}

/**
 * One store per process and per place it is kept: the Postgres one while the instance has a database, the
 * file one while it doesn't. Asked for on every use, so a changed address or secret is followed. A store
 * that seals nothing is asked for without a secret.
 */
export function chosenStore<T>(build: { postgres: (db: Database, secret: string) => T; file: () => T }): (secret?: string) => T {
  let built: { db: Database | null; secret: string; store: T } | null = null;
  return (secret = "") => {
    const db = database();
    if (!built || built.db !== db || built.secret !== secret) built = { db, secret, store: db ? build.postgres(db, secret) : build.file() };
    return built.store;
  };
}

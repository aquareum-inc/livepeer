import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";

import { createPool, database as queries, schemaStatus, type Database, type Pool, type SchemaStatus } from "@livepeer/db";
import { openEmbedded, type Embedded } from "@livepeer/db/embedded";
import { attachDatabasePool } from "@vercel/functions";

import { env } from "../env";

/**
 * Where the instance's database stands. "embedded" is the Postgres the app runs inside itself when it was
 * given none to connect to: it is always at this release's schema, since the app migrates it as it opens.
 */
export type DatabaseStatus = SchemaStatus | "embedded";

// Kept on the global object so a development reload reuses what is open instead of opening it again, and so
// every part of the server (the proxy, pages, routes, the alerts timer) shares the one database.
const held = globalThis as typeof globalThis & { livepeerDatabase?: { url: string; pool: Pool; db: Database }; livepeerEmbedded?: Embedded; livepeerEmbeddedOpening?: Promise<Embedded> };

const root = () => path.join(/* turbopackIgnore: true */ process.cwd(), "../..");

function connection(): { pool: Pool; db: Database } | null {
  const url = env("DATABASE_URL");
  if (!url) return null;
  if (held.livepeerDatabase?.url !== url) {
    void held.livepeerDatabase?.pool.end();
    const pool = createPool(url);
    // On Vercel a function is suspended between requests, and a connection left idle then is one the
    // database goes on holding. This has the host close idle connections first. Anywhere else it does nothing.
    attachDatabasePool(pool);
    held.livepeerDatabase = { url, pool, db: queries(pool) };
  }
  return held.livepeerDatabase;
}

/**
 * The instance's database. Everything the instance keeps is in it, on every host: the Postgres DATABASE_URL
 * names, or with none set, one the app runs inside itself and keeps in DATA_DIR. So development, tests and a
 * first look need nothing installed, and run the same statements production does.
 */
export function database(): Database {
  const db = connection()?.db ?? held.livepeerEmbedded?.db;
  if (!db) throw new Error("The instance's database isn't open. With no DATABASE_URL the server opens one of its own as it starts (apps/web/instrumentation.ts); a test opens one with useTestDatabase().");
  return db;
}

/**
 * Opens the app's own database for an instance that was given none to connect to, and brings it to this
 * release's schema. Called once as the server starts, before it answers anything, so everything after can
 * ask for the database without waiting. It lives in DATA_DIR (`.data` at the repository root by default),
 * which one server process may have open at a time.
 */
export async function openEmbeddedDatabase(): Promise<void> {
  if (env("DATABASE_URL") || held.livepeerEmbedded) return;
  const inRepository = path.join(/* turbopackIgnore: true */ root(), "packages/db/migrations");
  const dir = path.resolve(/* turbopackIgnore: true */ root(), env("DATA_DIR") || ".data", "postgres");
  held.livepeerEmbeddedOpening ??= openEmbedded({ dir, migrations: existsSync(/* turbopackIgnore: true */ inRepository) ? inRepository : path.join(/* turbopackIgnore: true */ root(), "migrations") }).catch((cause: unknown) => {
    delete held.livepeerEmbeddedOpening;
    throw new Error(`The instance has no DATABASE_URL and couldn't open a database of its own in ${dir}. On a host with no disk to write to, set DATABASE_URL to a Postgres database.`, { cause });
  });
  held.livepeerEmbedded = await held.livepeerEmbeddedOpening;
}

/** Whether the database can be reached and has every migration this release expects. */
export async function databaseStatus(): Promise<DatabaseStatus> {
  const pool = connection()?.pool;
  if (pool) return schemaStatus(pool);
  return held.livepeerEmbedded ? "embedded" : "unreachable";
}

/**
 * One store per process over the instance's database. Asked for on every use, so a changed address or
 * secret is followed. A store that seals nothing is asked for without a secret.
 */
export function storeOver<T>(build: (db: Database, secret: string) => T): (secret?: string) => T {
  let built: { db: Database; secret: string; store: T } | null = null;
  return (secret = "") => {
    const db = database();
    if (!built || built.db !== db || built.secret !== secret) built = { db, secret, store: build(db, secret) };
    return built.store;
  };
}

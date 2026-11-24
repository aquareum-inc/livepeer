import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

import { HEAD, MIGRATIONS_TABLE, schemaStatus } from "./status";

const folder = path.join(import.meta.dirname, "../migrations");

describe("the schema's status", () => {
  it("is behind on an empty database and ok once the committed migrations have run", async () => {
    const database = new PGlite();
    expect(await schemaStatus(database)).toBe("behind");

    await migrate(drizzle(database), { migrationsFolder: folder });
    expect(await schemaStatus(database)).toBe("ok");

    // Running them again changes nothing.
    await migrate(drizzle(database), { migrationsFolder: folder });
    const applied = await database.query<{ total: number }>(`select count(*)::int as total from ${MIGRATIONS_TABLE}`);
    expect(applied.rows[0]?.total).toBe(1);
    await database.close();
  });

  it("is behind when the database stopped at an earlier migration", async () => {
    const database = new PGlite();
    await migrate(drizzle(database), { migrationsFolder: folder });
    await database.query(`update ${MIGRATIONS_TABLE} set created_at = created_at - 1`);
    expect(await schemaStatus(database)).toBe("behind");
    await database.close();
  });

  it("is ok when the database is ahead, as it is while the release before a migration is still serving", async () => {
    const database = new PGlite();
    await migrate(drizzle(database), { migrationsFolder: folder });
    await database.query(`insert into ${MIGRATIONS_TABLE} (hash, created_at) values ('later', ${(HEAD?.when ?? 0) + 1})`);
    expect(await schemaStatus(database)).toBe("ok");
    await database.close();
  });

  it("is unreachable when the database can't be asked", async () => {
    expect(await schemaStatus({ query: () => Promise.reject(new Error("connect ECONNREFUSED")) })).toBe("unreachable");
  });

  it("names the newest committed migration as the head", () => {
    expect(HEAD?.tag).toMatch(/^\d{4}_/);
  });
});

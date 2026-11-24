import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "@livepeer/db";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { database, databaseStatus, openEmbeddedDatabase } from "./database";

const held = globalThis as typeof globalThis & { livepeerEmbedded?: { close: () => Promise<void> }; livepeerEmbeddedOpening?: Promise<unknown> };

/** Stops the app's own database, as the server stopping does. */
async function stop(): Promise<void> {
  const open = held.livepeerEmbedded;
  delete held.livepeerEmbedded;
  delete held.livepeerEmbeddedOpening;
  await open?.close();
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await stop();
});

describe("the instance's database", () => {
  it("is one the app runs itself when it is given none, kept in DATA_DIR and already at this release's schema", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "livepeer-embedded-"));
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("DATA_DIR", dir);
    expect(() => database()).toThrow(/isn't open/);
    expect(await databaseStatus()).toBe("unreachable");

    await openEmbeddedDatabase();
    expect(await databaseStatus()).toBe("embedded");
    await database().execute(sql`insert into hidden_characters (character_slug) values ('kept-across-restarts')`);

    // The server stops and starts again: what it kept is still there.
    await stop();
    await openEmbeddedDatabase();
    const kept = (await database().execute(sql`select character_slug from hidden_characters`)) as unknown as { rows: Array<{ character_slug: string }> };
    expect(kept.rows).toEqual([{ character_slug: "kept-across-restarts" }]);
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("says plainly what to do when it has nowhere to keep one", async () => {
    vi.stubEnv("DATABASE_URL", "");
    // A path that can't be a folder: a file is in the way.
    vi.stubEnv("DATA_DIR", path.join(import.meta.filename, "nowhere"));
    await expect(openEmbeddedDatabase()).rejects.toThrow(/set DATABASE_URL/);
  });

  it("is the Postgres DATABASE_URL names when there is one: one pool per address, and unreachable, not an error, when nothing answers", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://livepeer:example@127.0.0.1:1/livepeer");
    expect(database()).toBe(database());
    await openEmbeddedDatabase();
    expect(held.livepeerEmbedded).toBeUndefined();
    expect(await databaseStatus()).toBe("unreachable");
  });
});

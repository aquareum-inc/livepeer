import type { Character } from "@livepeer/api-client";
import { schema } from "@livepeer/db";
import { testDatabase } from "@livepeer/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { moderation, type ModerationStore, type StoredReport } from "./moderation";
import { postgresModerationStore } from "./postgres";

const report = (id: string, extra: Partial<StoredReport> = {}): StoredReport => ({ id, character_slug: "mara", character_name: "Mara", author: "studio-north", reason: "spam", note: null, created_at: "2026-11-20T12:00:00.000Z", state: "open", reporter: "usr_adam", ...extra });
const character = (slug: string, author: string, extra: Partial<Character> = {}): Character => ({ slug, name: slug, tagline: "", description: "", greeting: "", author, visibility: "public", mature: false, calls: false, tags: [], rating: 0, chats: 0, mine: false, image: null, artwork: { hues: [0, 0, 0], seed: 0 }, ...extra });

interface Opened {
  store: ModerationStore;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

const implementations: Array<[string, () => Promise<Opened>]> = [
  [
    "Postgres",
    async () => {
      const { db, close } = await testDatabase();
      return {
        store: postgresModerationStore(db),
        reset: async () => {
          for (const table of [schema.characterReports, schema.characterBlocks, schema.hiddenCharacters]) await db.delete(table);
        },
        close,
      };
    },
  ],
];

describe.each(implementations)("the moderation store over %s", (_kind, open) => {
  let opened: Opened;
  beforeAll(async () => {
    opened = await open();
  });
  beforeEach(() => opened.reset());
  afterAll(() => opened.close());
  const states = async () => Object.fromEntries((await opened.store.reports()).map((entry) => [entry.id, entry.state]));

  it("keeps one open report per person per character: a second changes the first, also when both arrive at once", async () => {
    expect(await opened.store.fileReport(report("rep_1"))).toEqual(report("rep_1"));
    expect(await opened.store.fileReport(report("rep_2", { reason: "hateful", note: "Slurs in the greeting" }))).toEqual(report("rep_1", { reason: "hateful", note: "Slurs in the greeting" }));
    expect(await opened.store.fileReport(report("rep_3", { reporter: "usr_rae" }))).toMatchObject({ id: "rep_3" });
    expect(await opened.store.fileReport(report("rep_4", { character_slug: "juno" }))).toMatchObject({ id: "rep_4" });
    expect((await opened.store.reports()).map((entry) => entry.id).sort()).toEqual(["rep_1", "rep_3", "rep_4"]);

    const together = await Promise.all([opened.store.fileReport(report("rep_5", { reporter: "usr_kit" })), opened.store.fileReport(report("rep_6", { reporter: "usr_kit" }))]);
    expect(new Set(together.map((entry) => entry.id)).size).toBe(1);
  });

  it("lets a person report a character again once their first report was decided", async () => {
    await opened.store.fileReport(report("rep_1"));
    await opened.store.resolve("rep_1", "dismissed");
    expect(await opened.store.fileReport(report("rep_2"))).toMatchObject({ id: "rep_2", state: "open" });
    expect(await states()).toEqual({ rep_1: "dismissed", rep_2: "open" });
  });

  it("dismisses one report and leaves the rest, or hides the character and closes every open report of it", async () => {
    await opened.store.fileReport(report("rep_1"));
    await opened.store.fileReport(report("rep_2", { reporter: "usr_rae" }));
    await opened.store.fileReport(report("rep_3", { reporter: "usr_kit" }));
    await opened.store.fileReport(report("rep_4", { character_slug: "juno" }));
    expect(await opened.store.resolve("rep_nope", "hidden")).toBeNull();

    expect(await opened.store.resolve("rep_1", "dismissed")).toMatchObject({ id: "rep_1", state: "dismissed" });
    expect(await opened.store.hidden()).toEqual([]);
    expect(await opened.store.resolve("rep_2", "hidden")).toMatchObject({ id: "rep_2", state: "hidden" });
    expect(await states()).toEqual({ rep_1: "dismissed", rep_2: "hidden", rep_3: "hidden", rep_4: "open" });
    expect(await opened.store.hidden()).toEqual(["mara"]);
    // Hiding what is already hidden changes nothing.
    await opened.store.fileReport(report("rep_5"));
    await opened.store.resolve("rep_5", "hidden");
    expect(await opened.store.hidden()).toEqual(["mara"]);
  });

  it("keeps each person's blocks apart, once each", async () => {
    await opened.store.block({ userId: "usr_adam", character_slug: "mara", author: "studio-north" });
    await opened.store.block({ userId: "usr_adam", character_slug: "mara", author: "studio-north" });
    await opened.store.block({ userId: "usr_rae", character_slug: "juno", author: "relay-club" });
    expect(await opened.store.blocksOf("usr_adam")).toEqual([{ userId: "usr_adam", character_slug: "mara", author: "studio-north" }]);
    expect(await opened.store.blocksOf("usr_nobody")).toEqual([]);
  });

  it("forgets a person: their blocks go, and their reports stay without saying who sent them", async () => {
    await opened.store.block({ userId: "usr_adam", character_slug: "mara", author: "studio-north" });
    await opened.store.block({ userId: "usr_rae", character_slug: "mara", author: "studio-north" });
    await opened.store.fileReport(report("rep_1"));
    await opened.store.fileReport(report("rep_2", { reporter: "usr_rae" }));
    await opened.store.forget("usr_adam");
    await opened.store.forget("usr_rae");
    expect(await opened.store.blocksOf("usr_adam")).toEqual([]);
    // Two people who are gone both have an open report of the same character, and neither is lost.
    expect((await opened.store.reports()).map((entry) => [entry.id, entry.reporter]).sort()).toEqual([["rep_1", "deleted"], ["rep_2", "deleted"]]);
  });

  it("answers what a person may see through moderation's own rules", async () => {
    const desk = moderation(opened.store, () => new Date("2026-11-20T12:00:00Z"));
    const mara = character("mara", "studio-north");
    const other = character("north-two", "studio-north");
    const juno = character("juno", "relay-club");

    const filed = await desk.report("usr_adam", juno, "spam", null);
    expect(filed).not.toHaveProperty("reporter");
    await desk.block("usr_adam", mara);
    const adam = await desk.visible("usr_adam");
    expect([adam(mara), adam(other), adam(juno)]).toEqual([false, false, true]);
    expect((await desk.visible(null))(mara)).toBe(true);

    await desk.resolve(filed.id, "hidden");
    expect((await desk.visible(null))(juno)).toBe(false);
    expect((await desk.visible("usr_rae"))(juno)).toBe(false);
    expect(await desk.reports()).toEqual([expect.objectContaining({ id: filed.id, state: "hidden", created_at: "2026-11-20T12:00:00.000Z" })]);
  });
});

import type { Character } from "@livepeer/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { emptyDatabase, testDatabase, useTestDatabase } from "../data/testing";
import { moderation } from "./moderation";
import { postgresModerationStore } from "./postgres";

useTestDatabase();
beforeEach(emptyDatabase);

const character = (slug: string, author: string, extra: Partial<Character> = {}): Character => ({
  slug, name: slug, tagline: "", description: "", greeting: "", author, visibility: "public", mature: false, calls: false, tags: [], rating: 0, chats: 0, mine: false, image: null, artwork: { hues: [0, 0, 0], seed: 0 }, ...extra,
});

const fresh = () => moderation(postgresModerationStore(testDatabase()), () => new Date("2026-11-20T12:00:00Z"));

describe("moderation", () => {
  it("files a report without saying who sent it, and a second one from the same person updates it", async () => {
    const desk = fresh();
    const mara = character("mara", "studio-north");
    const first = await desk.report("u1", mara, "spam", null);
    expect(first).not.toHaveProperty("reporter");
    const second = await desk.report("u1", mara, "hateful", "Slurs in the greeting");
    expect(second.id).toBe(first.id);
    expect(await desk.reports()).toEqual([expect.objectContaining({ reason: "hateful", note: "Slurs in the greeting", state: "open" })]);
    await desk.report("u2", mara, "spam", null);
    expect(await desk.reports()).toHaveLength(2);
  });

  it("hides a blocked character and everything by its author, for that person only", async () => {
    const desk = fresh();
    await desk.block("u1", character("vesper", "after-hours"));
    const forU1 = await desk.visible("u1");
    expect(forU1(character("vesper", "after-hours"))).toBe(false);
    expect(forU1(character("nocturne", "after-hours"))).toBe(false);
    expect(forU1(character("mara", "studio-north"))).toBe(true);
    expect((await desk.visible("u2"))(character("vesper", "after-hours"))).toBe(true);
    expect((await desk.visible(null))(character("vesper", "after-hours"))).toBe(true);
  });

  it("never hides a person's own character from them by a block", async () => {
    const desk = fresh();
    await desk.block("u1", character("vesper", "me"));
    expect((await desk.visible("u1"))(character("mine", "me", { mine: true }))).toBe(true);
  });

  it("takes a character down for everyone when the operator hides it, closing its other reports", async () => {
    const desk = fresh();
    const lumen = character("lumen", "open-lens");
    const report = await desk.report("u1", lumen, "impersonation", null);
    await desk.report("u2", lumen, "spam", null);
    await desk.resolve(report.id, "hidden");
    expect((await desk.visible(null))(lumen)).toBe(false);
    expect((await desk.visible("u3"))(lumen)).toBe(false);
    expect((await desk.reports()).every((entry) => entry.state === "hidden")).toBe(true);
  });

  it("keeps a dismissed character up, and lists open reports first", async () => {
    const desk = fresh();
    const dismissed = await desk.report("u1", character("okon", "cutting-room"), "spam", null);
    await desk.report("u1", character("juno", "relay-club"), "violent", null);
    await desk.resolve(dismissed.id, "dismissed");
    expect((await desk.visible(null))(character("okon", "cutting-room"))).toBe(true);
    expect((await desk.reports()).map((entry) => entry.state)).toEqual(["open", "dismissed"]);
    expect(await desk.resolve("rep_missing", "hidden")).toBeNull();
  });
});

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { diskStorage, type DiskStorage } from "./disk";

const body = (bytes: number[]): ReadableStream<Uint8Array> => new Blob([new Uint8Array(bytes)]).stream() as ReadableStream<Uint8Array>;
const parts = (address: string): { key: string; query: URLSearchParams } => {
  const url = new URL(address, "http://instance.test");
  return { key: url.pathname.replace("/api/storage/", ""), query: url.searchParams };
};
const read = async (stream: ReadableStream<Uint8Array>): Promise<number[]> => [...new Uint8Array(await new Response(stream).arrayBuffer())];

describe("storage on the instance's own disk", () => {
  let dir: string;
  let clock = Date.UTC(2026, 10, 27, 12);
  let storage: DiskStorage;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "livepeer-storage-"));
    storage = diskStorage({ dir: path.join(dir, "media"), secret: "a-secret-for-this-test-only", basePath: "/api/storage", now: () => clock });
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  const send = async (key: string, bytes: number[], type = "image/png", declared = bytes.length) => {
    const leave = await storage.signPut(key, { contentType: type, contentLength: declared, expiresInSeconds: 900 });
    return { leave, status: await storage.receive({ ...parts(leave.url), contentType: leave.headers["Content-Type"] ?? null, body: body(bytes) }) };
  };

  it("takes a file at the address it signed and gives it back at another", async () => {
    const { leave, status } = await send("uploads/upl_one", [1, 2, 3, 4]);
    expect(leave).toMatchObject({ method: "PUT", headers: { "Content-Type": "image/png" } });
    expect(leave.url.startsWith("/api/storage/uploads/upl_one?")).toBe(true);
    expect(status).toBe(200);
    expect(await storage.head("uploads/upl_one")).toEqual({ size: 4, contentType: "image/png" });

    const file = await storage.open(...(Object.values(parts(await storage.signGet("uploads/upl_one", { expiresInSeconds: 300 }))) as [string, URLSearchParams]));
    expect(file).toMatchObject({ size: 4, contentType: "image/png" });
    expect(await read(file!.body)).toEqual([1, 2, 3, 4]);
  });

  it("keeps nothing of a file that isn't the length or type that was signed", async () => {
    expect((await send("uploads/upl_long", [1, 2, 3, 4, 5], "image/png", 4)).status).toBe(413);
    expect((await send("uploads/upl_short", [1, 2], "image/png", 4)).status).toBe(400);
    const leave = await storage.signPut("uploads/upl_type", { contentType: "image/png", contentLength: 2, expiresInSeconds: 900 });
    expect(await storage.receive({ ...parts(leave.url), contentType: "text/html", body: body([1, 2]) })).toBe(400);
    for (const key of ["uploads/upl_long", "uploads/upl_short", "uploads/upl_type"]) expect(await storage.head(key)).toBeNull();
    expect((await readdir(path.join(dir, "media", "uploads"))).filter((name) => name.endsWith(".part"))).toEqual([]);
  });

  it("refuses an address that was changed, is for something else, or is out of date", async () => {
    const leave = await storage.signPut("uploads/upl_two", { contentType: "image/png", contentLength: 2, expiresInSeconds: 900 });
    const { query } = parts(leave.url);
    const png = { contentType: "image/png" };

    const longer = new URLSearchParams(query);
    longer.set("length", "200");
    expect(await storage.receive({ key: "uploads/upl_two", query: longer, ...png, body: body([1, 2]) })).toBe(403);
    expect(await storage.receive({ key: "uploads/upl_other", query, ...png, body: body([1, 2]) })).toBe(403);
    expect(await storage.receive({ key: "../outside", query, ...png, body: body([1, 2]) })).toBe(403);
    // A PUT address doesn't read, and a GET address doesn't write.
    expect(await storage.open("uploads/upl_two", query)).toBeNull();
    const reading = parts(await storage.signGet("uploads/upl_one", { expiresInSeconds: 300 }));
    expect(await storage.receive({ ...reading, ...png, body: body([9]) })).toBe(403);

    clock += 901_000;
    expect(await storage.receive({ key: "uploads/upl_two", query, ...png, body: body([1, 2]) })).toBe(403);
    expect(await storage.open(reading.key, reading.query)).toBeNull();
  });

  it("removes a file, and removing nothing is fine", async () => {
    await storage.remove("uploads/upl_one");
    await storage.remove("uploads/upl_one");
    expect(await storage.head("uploads/upl_one")).toBeNull();
    expect(await readdir(path.join(dir, "media", "uploads"))).toEqual([]);
  });

  it("says whether it can keep files at all", async () => {
    expect(await storage.check()).toBe("ok");
    const nowhere = diskStorage({ dir: "/dev/null/media", secret: "s", basePath: "/api/storage" });
    expect(await nowhere.check()).toMatch(/can't be written to/);
    await expect(nowhere.signPut("uploads/upl_x", { contentType: "image/png", contentLength: 1, expiresInSeconds: 60 })).rejects.toMatchObject({ name: "StorageUnavailable" });
  });
});

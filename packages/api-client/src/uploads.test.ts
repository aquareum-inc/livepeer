import { memoryStorage, type MemoryStorage } from "@livepeer/storage/memory";
import { describe, expect, it } from "vitest";

import { createApiClient, createMediaStore, createMockProvider, memoryUploadRecords, UPLOAD_RULES, UploadRefused, type MediaStore, type UploadRecords } from "./index";

const picture = { kind: "image" as const, name: "IMG_2041.jpeg", content_type: "image/jpeg", size_bytes: 4 };
const bytes = new Uint8Array([9, 8, 7, 6]);

/** An instance's media store over memory, with the clock in the test's hands. */
function setup(): { media: MediaStore; storage: MemoryStorage; records: UploadRecords; clock: { now: number } } {
  const clock = { now: Date.UTC(2026, 10, 27, 12) };
  const storage = memoryStorage();
  const records = memoryUploadRecords();
  return { media: createMediaStore({ records, storage, now: () => clock.now }), storage, records, clock };
}
const clientFor = (media: MediaStore, user = { id: "usr_demo_adam", name: "Adam Soffer" }, workspaceId: string | null = null) => createApiClient({ env: { MOCK_ONLY: "1" }, media, user, workspaceId, provider });
const provider = createMockProvider();

describe("uploads: straight to storage, then confirmed", () => {
  it("gives leave to send one file to storage, and adds it to the library once it is there", async () => {
    const { media, storage } = setup();
    const api = clientFor(media);
    const ticket = (await api.requestUpload({ ...picture, aspect: "9:16" })).data;
    expect(ticket).toMatchObject({ method: "PUT", headers: { "Content-Type": "image/jpeg" }, max_bytes: UPLOAD_RULES.image.maxBytes });
    expect(ticket.url).toContain(`uploads/${ticket.id}`);
    // Nothing is in the library until the file is.
    expect((await api.listMedia({ source: "upload" })).data).toEqual([]);

    expect(storage.put(ticket.url, bytes, "image/jpeg")).toBe(true);
    const item = (await api.completeUpload(ticket.id)).data;
    expect(item).toMatchObject({ kind: "image", source: "upload", title: "IMG 2041", aspect: "9:16", image: `/api/media/${item?.id}`, made_by: null });
    expect((await api.listMedia({ source: "upload" })).data.map((entry) => entry.id)).toEqual([item?.id]);
    expect((await api.listMedia()).data[0]?.id).toBe(item?.id);
    expect((await api.listMedia({ kind: "video" })).data.map((entry) => entry.id)).not.toContain(item?.id);
    expect((await api.getMediaUrl(item?.id ?? "")).data).toContain(`uploads/${ticket.id}`);
  });

  it("keeps a video too, with no still", async () => {
    const { media, storage } = setup();
    const api = clientFor(media);
    const ticket = (await api.requestUpload({ kind: "video", name: "harbour walk.MOV", content_type: "video/quicktime", size_bytes: 2 })).data;
    storage.put(ticket.url, new Uint8Array([1, 2]), "video/quicktime");
    const item = (await api.completeUpload(ticket.id)).data;
    expect(item).toMatchObject({ kind: "video", source: "upload", title: "harbour walk", image: null, aspect: "16:9" });
    expect((await api.getMediaUrl(item?.id ?? "")).data).not.toBeNull();
    expect(storage.keys()).toEqual([`uploads/${ticket.id}`]);
  });

  it("answers the same when asked to complete twice, and nothing for a ticket that isn't the caller's", async () => {
    const { media, storage } = setup();
    const api = clientFor(media);
    const ticket = (await api.requestUpload(picture)).data;
    storage.put(ticket.url, bytes, "image/jpeg");
    const first = (await api.completeUpload(ticket.id)).data;
    expect((await api.completeUpload(ticket.id)).data).toEqual(first);
    expect((await api.listMedia({ source: "upload" })).data).toHaveLength(1);

    expect((await api.completeUpload("upl_unknown")).data).toBeNull();
    const someoneElse = clientFor(media, { id: "usr_other", name: "Someone Else" });
    expect((await someoneElse.completeUpload(ticket.id)).data).toBeNull();
    expect((await someoneElse.listMedia({ source: "upload" })).data).toEqual([]);
    expect((await someoneElse.deleteMedia(first?.id ?? "")).data).toBe(false);
  });

  it("turns away what it can't take before anything is sent", async () => {
    const { media, records } = setup();
    const api = clientFor(media);
    await expect(api.requestUpload({ ...picture, content_type: "image/heic" })).rejects.toMatchObject({ code: "unsupported_type" });
    await expect(api.requestUpload({ ...picture, content_type: "video/mp4" })).rejects.toBeInstanceOf(UploadRefused);
    await expect(api.requestUpload({ ...picture, size_bytes: UPLOAD_RULES.image.maxBytes + 1 })).rejects.toMatchObject({ code: "too_large" });
    await expect(api.requestUpload({ ...picture, size_bytes: 0 })).rejects.toMatchObject({ code: "empty" });
    await expect(api.requestUpload({ ...picture, size_bytes: 1.5 })).rejects.toMatchObject({ code: "empty" });
    expect(await records.abandoned(new Date(8.64e15), 10)).toEqual([]);
  });

  it("checks what arrived for itself", async () => {
    const { media, storage } = setup();
    const api = clientFor(media);

    const waiting = (await api.requestUpload(picture)).data;
    await expect(api.completeUpload(waiting.id)).rejects.toMatchObject({ code: "not_received" });
    // Nothing arrived, so the ticket is still good for the file.
    storage.put(waiting.url, bytes, "image/jpeg");
    expect((await api.completeUpload(waiting.id)).data).not.toBeNull();

    // Storage refuses a file that isn't what was signed for.
    const strict = (await api.requestUpload(picture)).data;
    expect(storage.put(strict.url, new Uint8Array(5), "image/jpeg")).toBe(false);
    expect(storage.put(strict.url, bytes, "text/html")).toBe(false);

    // If one got past storage all the same, it is removed and the answer says why.
    const wrongType = (await api.requestUpload(picture)).data;
    storage.force(`uploads/${wrongType.id}`, bytes, "text/html");
    await expect(api.completeUpload(wrongType.id)).rejects.toMatchObject({ code: "unsupported_type" });
    const tooLarge = (await api.requestUpload(picture)).data;
    storage.force(`uploads/${tooLarge.id}`, new Uint8Array(UPLOAD_RULES.image.maxBytes + 1), "image/jpeg");
    await expect(api.completeUpload(tooLarge.id)).rejects.toMatchObject({ code: "too_large" });
    const other = (await api.requestUpload(picture)).data;
    storage.force(`uploads/${other.id}`, new Uint8Array(3), "image/jpeg");
    await expect(api.completeUpload(other.id)).rejects.toMatchObject({ code: "not_received" });

    expect(storage.keys()).toEqual([`uploads/${waiting.id}`]);
    expect((await api.completeUpload(wrongType.id)).data).toBeNull();
  });

  it("removes the file with its library item", async () => {
    const { media, storage } = setup();
    const api = clientFor(media);
    const ticket = (await api.requestUpload(picture)).data;
    storage.put(ticket.url, bytes, "image/jpeg");
    const item = (await api.completeUpload(ticket.id)).data;
    expect((await api.deleteMedia(item?.id ?? "")).data).toBe(true);
    expect(storage.keys()).toEqual([]);
    expect((await api.listMedia({ source: "upload" })).data).toEqual([]);
    expect((await api.getMediaUrl(item?.id ?? "")).data).toBeNull();
    // The mocked part of the library is still deleted from as before.
    const seeded = (await api.listMedia()).data[0];
    expect((await api.deleteMedia(seeded?.id ?? "")).data).toBe(true);
  });

  it("sweeps uploads that were asked for and never completed, and leaves the rest", async () => {
    const { media, storage, records, clock } = setup();
    const api = clientFor(media);
    const kept = (await api.requestUpload(picture)).data;
    storage.put(kept.url, bytes, "image/jpeg");
    await api.completeUpload(kept.id);
    const sentNeverCompleted = (await api.requestUpload(picture)).data;
    storage.put(sentNeverCompleted.url, bytes, "image/jpeg");
    const neverSent = (await api.requestUpload(picture)).data;

    expect(await media.sweep()).toBe(0);
    // The address lapses after 15 minutes; the upload can still be completed for an hour.
    clock.now += 16 * 60_000;
    expect(Date.parse(neverSent.expires_at)).toBeLessThan(clock.now);
    expect(await media.sweep()).toBe(0);

    clock.now += 45 * 60_000;
    expect((await api.completeUpload(sentNeverCompleted.id)).data).toBeNull();
    expect(await media.sweep()).toBe(2);
    expect(storage.keys()).toEqual([`uploads/${kept.id}`]);
    expect(await records.find(neverSent.id)).toBeNull();
    expect((await api.listMedia({ source: "upload" })).data).toHaveLength(1);
  });

  it("keeps a workspace's files in the workspace, and says who added them", async () => {
    const { media, storage } = setup();
    const workspace = await provider.workspaces.create({ name: "Tide Pool Films", ownerId: "usr_demo_adam" });
    const inWorkspace = clientFor(media, { id: "usr_demo_adam", name: "Adam Soffer" }, workspace.id);
    const ticket = (await inWorkspace.requestUpload(picture)).data;
    storage.put(ticket.url, bytes, "image/jpeg");
    const item = (await inWorkspace.completeUpload(ticket.id)).data;
    expect(item?.made_by).toBe("Adam Soffer");
    expect((await inWorkspace.listMedia({ source: "upload" })).data).toMatchObject([{ id: item?.id, made_by: "Adam Soffer" }]);
    // Not in the same person's own library, and not gone when their account is.
    const personal = clientFor(media);
    expect((await personal.listMedia({ source: "upload" })).data).toEqual([]);
    const own = (await personal.requestUpload(picture)).data;
    storage.put(own.url, bytes, "image/jpeg");
    await personal.completeUpload(own.id);
    expect(await media.forget("usr_demo_adam")).toBe(1);
    expect(storage.keys()).toEqual([`uploads/${ticket.id}`]);
  });

  it("says so when the instance has nowhere to keep files", async () => {
    const storage = memoryStorage();
    const failing = { ...storage, signPut: async () => { throw Object.assign(new Error("no disk"), { name: "StorageUnavailable" }); } };
    const api = clientFor(createMediaStore({ records: memoryUploadRecords(), storage: failing }));
    await expect(api.requestUpload(picture)).rejects.toMatchObject({ code: "uploads_unavailable" });
  });
});

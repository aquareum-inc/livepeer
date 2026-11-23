import { describe, expect, it } from "vitest";

import { createApiClient, UPLOAD_RULES, UploadRefused } from "./index";

const client = () => createApiClient({ env: { MOCK_ONLY: "1" } });
const picture = { kind: "image" as const, name: "IMG_2041.jpeg", content_type: "image/jpeg", size_bytes: 4 };

describe("uploads (mock media store)", () => {
  it("adds a picture to the library and keeps it to show", async () => {
    const api = client();
    const ticket = (await api.requestUpload({ ...picture, aspect: "9:16" })).data;
    expect(ticket.path).toBe(`/api/v1/uploads/${ticket.id}`);
    expect(ticket.max_bytes).toBe(UPLOAD_RULES.image.maxBytes);

    const item = (await api.receiveUpload(ticket.id, new Uint8Array([9, 8, 7, 6]))).data;
    expect(item).toMatchObject({ kind: "image", source: "upload", title: "IMG 2041", aspect: "9:16", image: `/api/media/${item?.id}` });
    expect((await api.listMedia({ source: "upload" })).data.map((entry) => entry.id)).toContain(item?.id);

    const file = (await api.readMediaFile(item?.id ?? "")).data;
    expect(file?.content_type).toBe("image/jpeg");
    expect([...(file?.bytes ?? [])]).toEqual([9, 8, 7, 6]);
  });

  it("records a video without a still", async () => {
    const api = client();
    const ticket = (await api.requestUpload({ kind: "video", name: "harbour walk.MOV", content_type: "video/quicktime", size_bytes: 2 })).data;
    const item = (await api.receiveUpload(ticket.id, new Uint8Array([1, 2]))).data;
    expect(item).toMatchObject({ kind: "video", source: "upload", title: "harbour walk", image: null, aspect: "16:9" });
    expect((await api.readMediaFile(item?.id ?? "")).data).toBeNull();
  });

  it("gives a ticket one use", async () => {
    const api = client();
    const ticket = (await api.requestUpload(picture)).data;
    expect((await api.receiveUpload(ticket.id, new Uint8Array([1]))).data).not.toBeNull();
    expect((await api.receiveUpload(ticket.id, new Uint8Array([1]))).data).toBeNull();
    expect((await api.receiveUpload("upl_unknown", new Uint8Array([1]))).data).toBeNull();
  });

  it("turns away what it can't take, before and after the file is sent", async () => {
    const api = client();
    await expect(api.requestUpload({ ...picture, content_type: "image/heic" })).rejects.toMatchObject({ code: "unsupported_type" });
    await expect(api.requestUpload({ ...picture, content_type: "video/mp4" })).rejects.toBeInstanceOf(UploadRefused);
    await expect(api.requestUpload({ ...picture, size_bytes: UPLOAD_RULES.image.maxBytes + 1 })).rejects.toMatchObject({ code: "too_large" });
    await expect(api.requestUpload({ ...picture, size_bytes: 0 })).rejects.toMatchObject({ code: "empty" });

    const ticket = (await api.requestUpload(picture)).data;
    await expect(api.receiveUpload(ticket.id, new Uint8Array(0))).rejects.toMatchObject({ code: "empty" });
    // A refused file leaves the ticket good for another try.
    expect((await api.receiveUpload(ticket.id, new Uint8Array([1]))).data).not.toBeNull();
  });
});

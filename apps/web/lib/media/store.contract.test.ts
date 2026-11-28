import { memoryUploadRecords, type UploadRecord, type UploadRecords } from "@livepeer/api-client";
import { schema } from "@livepeer/db";
import { testDatabase } from "@livepeer/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { postgresUploadRecords } from "./postgres";

const at = (minute: number): string => new Date(Date.UTC(2026, 10, 27, 12, minute)).toISOString();
const upload = (id: string, extra: Partial<UploadRecord> = {}): UploadRecord => ({ id, media_id: `med_${id}`, user_id: "usr_adam", workspace_id: null, kind: "image", content_type: "image/png", size_bytes: 2048, title: "Tide pool", aspect: "1:1", object_key: `uploads/${id}`, state: "pending", created_at: at(0), expires_at: at(60), ...extra });

interface Opened {
  records: UploadRecords;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

const implementations: Array<[string, () => Promise<Opened>]> = [
  [
    "Postgres",
    async () => {
      const { db, close } = await testDatabase();
      return { records: postgresUploadRecords(db), reset: async () => void (await db.delete(schema.mediaFiles)), close };
    },
  ],
  [
    "memory",
    async () => {
      let records = memoryUploadRecords();
      // Handed out through one object, so a reset is seen by the tests that already hold it.
      const through: UploadRecords = { insert: (r) => records.insert(r), find: (id) => records.find(id), findStoredMedia: (id) => records.findStoredMedia(id), markStored: (id) => records.markStored(id), listStored: (a) => records.listStored(a), abandoned: (n, l) => records.abandoned(n, l), delete: (id) => records.delete(id) };
      return { records: through, reset: async () => void (records = memoryUploadRecords()), close: async () => undefined };
    },
  ],
];

describe.each(implementations)("upload records over %s", (_kind, open) => {
  let opened: Opened;
  beforeAll(async () => {
    opened = await open();
  });
  beforeEach(() => opened.reset());
  afterAll(() => opened.close());

  it("keeps a ticket as it was given, and finds it by its id", async () => {
    const { records } = opened;
    const ticket = upload("upl_1", { workspace_id: "wsp_north", kind: "video", content_type: "video/mp4", size_bytes: 150 * 1024 * 1024, aspect: "9:16" });
    await records.insert(ticket);
    expect(await records.find("upl_1")).toEqual(ticket);
    expect(await records.find("upl_none")).toBeNull();
  });

  it("is a file in a library only once it is stored", async () => {
    const { records } = opened;
    await records.insert(upload("upl_1"));
    expect(await records.findStoredMedia("med_upl_1")).toBeNull();
    expect(await records.listStored({ userId: "usr_adam", workspaceId: null })).toEqual([]);

    expect(await records.markStored("upl_1")).toMatchObject({ id: "upl_1", state: "stored" });
    expect(await records.markStored("upl_none")).toBeNull();
    expect(await records.findStoredMedia("med_upl_1")).toMatchObject({ id: "upl_1" });
  });

  it("lists a person's own files and a workspace's apart, newest first", async () => {
    const { records } = opened;
    await records.insert(upload("upl_old", { state: "stored", created_at: at(1) }));
    await records.insert(upload("upl_new", { state: "stored", created_at: at(5) }));
    await records.insert(upload("upl_theirs", { state: "stored", user_id: "usr_ines" }));
    await records.insert(upload("upl_shared", { state: "stored", workspace_id: "wsp_north" }));
    await records.insert(upload("upl_shared_theirs", { state: "stored", workspace_id: "wsp_north", user_id: "usr_ines", created_at: at(9) }));

    expect((await records.listStored({ userId: "usr_adam", workspaceId: null })).map((row) => row.id)).toEqual(["upl_new", "upl_old"]);
    expect((await records.listStored({ userId: "usr_adam", workspaceId: "wsp_north" })).map((row) => row.id)).toEqual(["upl_shared_theirs", "upl_shared"]);
    expect(await records.listStored({ userId: "usr_adam", workspaceId: "wsp_other" })).toEqual([]);
  });

  it("finds what was abandoned: pending past its time, oldest first, never a stored file", async () => {
    const { records } = opened;
    await records.insert(upload("upl_stored", { state: "stored", expires_at: at(10) }));
    await records.insert(upload("upl_late", { expires_at: at(20) }));
    await records.insert(upload("upl_later", { expires_at: at(30) }));
    await records.insert(upload("upl_fresh", { expires_at: at(90) }));

    const now = new Date(at(45));
    expect((await records.abandoned(now, 10)).map((row) => row.id)).toEqual(["upl_late", "upl_later"]);
    expect((await records.abandoned(now, 1)).map((row) => row.id)).toEqual(["upl_late"]);

    await records.delete("upl_late");
    await records.delete("upl_late");
    expect((await records.abandoned(now, 10)).map((row) => row.id)).toEqual(["upl_later"]);
  });
});

import type { ObjectStorage } from "@livepeer/storage/types";

import type { UploadRequest, UploadTicket } from "./types";

/** Why a file was turned away, in words for the person who chose it. */
export class UploadRefused extends Error {
  readonly code: "unsupported_type" | "too_large" | "empty" | "not_received" | "uploads_unavailable";

  constructor(code: UploadRefused["code"], message: string) {
    super(message);
    this.name = "UploadRefused";
    this.code = code;
  }
}

const MEGABYTE = 1024 * 1024;

/** What can be sent, and how large. Pictures in the formats every client can show; video as phones record it. */
export const UPLOAD_RULES = {
  image: { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 20 * MEGABYTE, say: "A picture can be up to 20 MB. Use a JPEG, PNG or WebP." },
  video: { types: ["video/mp4", "video/quicktime", "video/webm"], maxBytes: 200 * MEGABYTE, say: "A video can be up to 200 MB. Use an MP4, MOV or WebM." },
} as const;

/** How long the address a file is sent to is good for. */
const SEND_SECONDS = 15 * 60;
/** How long after it was asked for an upload can still be completed. Past this it is abandoned and swept. */
const COMPLETE_MS = 60 * 60_000;
/** How long the address a file is read from is good for. */
export const READ_SECONDS = 5 * 60;
/** How many abandoned uploads one sweep removes. */
const SWEEP = 50;

/** Whose a file is: the person who sent it, and the workspace they were working in, by the provider's ids. */
export interface MediaAccount {
  userId: string;
  workspaceId: string | null;
}

/** One upload as the instance records it: a ticket while `pending`, a file in the library once `stored`. */
export interface UploadRecord {
  /** The ticket's id. */
  id: string;
  /** The library item's id, which is also the address the file is read at. */
  media_id: string;
  user_id: string;
  workspace_id: string | null;
  kind: UploadRequest["kind"];
  content_type: string;
  size_bytes: number;
  title: string;
  aspect: "16:9" | "9:16" | "1:1";
  /** Where the file is in storage. */
  object_key: string;
  state: "pending" | "stored";
  created_at: string;
  /** Until when a pending upload can be completed. */
  expires_at: string;
}

/** Where upload records are kept: Postgres in the instance, memory in tests. It keeps, finds and removes; the rules are in the store. */
export interface UploadRecords {
  insert(record: UploadRecord): Promise<void>;
  find(id: string): Promise<UploadRecord | null>;
  findStoredMedia(mediaId: string): Promise<UploadRecord | null>;
  /** Marks a pending upload stored. Answers with the record as it now is, or null when there is none. */
  markStored(id: string): Promise<UploadRecord | null>;
  /** An account's stored files, newest first: a workspace's, or with none the person's own. */
  listStored(account: MediaAccount): Promise<UploadRecord[]>;
  /** Pending uploads that could no longer be completed at `now`, oldest first. */
  abandoned(now: Date, limit: number): Promise<UploadRecord[]>;
  delete(id: string): Promise<void>;
}

/** A file in the library, as the store knows it. The client makes the library item from this. */
export interface StoredMedia {
  id: string;
  kind: UploadRequest["kind"];
  title: string;
  aspect: "16:9" | "9:16" | "1:1";
  content_type: string;
  size_bytes: number;
  created_at: string;
  /** The user who sent it, by the provider's id. */
  added_by: string;
}

/**
 * The instance's own files: what people send from a device. The bytes go from the client straight to object
 * storage and never through here; this hands out leave to send one file, checks what arrived, and keeps the
 * record that puts it in a library.
 */
export interface MediaStore {
  /** Checks a file before it is sent and answers with where to send it. Throws `UploadRefused`. */
  requestUpload(account: MediaAccount, request: UploadRequest): Promise<UploadTicket>;
  /**
   * Confirms the file a ticket was given for is in storage as declared. Null when the ticket isn't this
   * account's, is unknown or has lapsed. Safe to repeat. Throws `UploadRefused` when the file isn't there or
   * isn't what was declared.
   */
  completeUpload(account: MediaAccount, uploadId: string): Promise<StoredMedia | null>;
  list(account: MediaAccount): Promise<StoredMedia[]>;
  /** A short-lived address the file can be read from. Null when there is no such file. */
  urlFor(mediaId: string): Promise<string | null>;
  remove(account: MediaAccount, mediaId: string): Promise<boolean>;
  /** Removes everything in a person's own library, when their account is deleted. A workspace's files stay. */
  forget(userId: string): Promise<number>;
  /** Removes uploads that were asked for and never completed. Answers with how many. */
  sweep(): Promise<number>;
}

const token = (): string => globalThis.crypto.randomUUID().replace(/-/g, "");

function titleFor(name: string, kind: UploadRequest["kind"]): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return kind === "image" ? "Uploaded picture" : "Uploaded video";
  return base.length > 60 ? `${base.slice(0, 58)}…` : base;
}

const stored = (record: UploadRecord): StoredMedia => ({ id: record.media_id, kind: record.kind, title: record.title, aspect: record.aspect, content_type: record.content_type, size_bytes: record.size_bytes, created_at: record.created_at, added_by: record.user_id });
const owns = (account: MediaAccount, record: UploadRecord): boolean => (account.workspaceId ? record.workspace_id === account.workspaceId : record.workspace_id === null && record.user_id === account.userId);
/** Told by name: the storage package is not loaded here, so this file stays safe to bundle for a browser. */
const unavailable = (cause: unknown): boolean => cause instanceof Error && cause.name === "StorageUnavailable";

export function createMediaStore(options: { records: UploadRecords; storage: ObjectStorage; now?: () => number }): MediaStore {
  const { records, storage } = options;
  const now = options.now ?? Date.now;

  const discard = async (record: UploadRecord): Promise<void> => {
    await storage.remove(record.object_key);
    await records.delete(record.id);
  };
  const sweep = async (limit: number): Promise<number> => {
    let removed = 0;
    for (const record of await records.abandoned(new Date(now()), limit)) {
      try {
        await discard(record);
        removed += 1;
      } catch {
        // Storage didn't answer: the record stays, so the file is found again on the next round.
      }
    }
    return removed;
  };

  return {
    async requestUpload(account, request) {
      const rules = UPLOAD_RULES[request.kind];
      const type = request.content_type.toLowerCase().split(";")[0]?.trim() ?? "";
      if (!(rules.types as readonly string[]).includes(type)) throw new UploadRefused("unsupported_type", rules.say);
      if (!Number.isInteger(request.size_bytes) || request.size_bytes <= 0) throw new UploadRefused("empty", "That file is empty.");
      if (request.size_bytes > rules.maxBytes) throw new UploadRefused("too_large", rules.say);

      // A few of what others abandoned are tidied as each new upload is asked for, so a host with nothing
      // running between requests is tidied too.
      await sweep(5).catch(() => 0);

      const id = `upl_${token()}`;
      const at = now();
      const key = `uploads/${id}`;
      let leave;
      try {
        leave = await storage.signPut(key, { contentType: type, contentLength: request.size_bytes, expiresInSeconds: SEND_SECONDS });
      } catch (cause) {
        if (unavailable(cause)) throw new UploadRefused("uploads_unavailable", "This service can't take files yet. Its operator needs to set up storage.");
        throw cause;
      }
      await records.insert({ id, media_id: `med_${token()}`, user_id: account.userId, workspace_id: account.workspaceId, kind: request.kind, content_type: type, size_bytes: request.size_bytes, title: titleFor(request.name, request.kind), aspect: request.aspect ?? "16:9", object_key: key, state: "pending", created_at: new Date(at).toISOString(), expires_at: new Date(at + COMPLETE_MS).toISOString() });
      return { id, url: leave.url, method: leave.method, headers: leave.headers, max_bytes: rules.maxBytes, expires_at: new Date(at + SEND_SECONDS * 1000).toISOString() };
    },

    async completeUpload(account, uploadId) {
      const record = await records.find(uploadId);
      if (!record || !owns(account, record) || record.user_id !== account.userId) return null;
      if (record.state === "stored") return stored(record);
      if (Date.parse(record.expires_at) < now()) return null;

      const held = await storage.head(record.object_key);
      if (!held) throw new UploadRefused("not_received", "The file didn't arrive. Send it again.");
      // Storage refuses a file that isn't the length and type its address was signed for. This is the
      // instance checking for itself rather than taking that on trust.
      if (held.size !== record.size_bytes || held.contentType !== record.content_type) {
        await discard(record);
        const rules = UPLOAD_RULES[record.kind];
        if (held.size > rules.maxBytes) throw new UploadRefused("too_large", rules.say);
        if (held.contentType !== record.content_type) throw new UploadRefused("unsupported_type", rules.say);
        throw new UploadRefused("not_received", "That isn't the file that was asked about. Choose it again.");
      }
      const marked = await records.markStored(uploadId);
      return marked ? stored(marked) : null;
    },

    async list(account) {
      return (await records.listStored(account)).map(stored);
    },

    async urlFor(mediaId) {
      const record = await records.findStoredMedia(mediaId);
      return record ? storage.signGet(record.object_key, { expiresInSeconds: READ_SECONDS }) : null;
    },

    async remove(account, mediaId) {
      const record = await records.findStoredMedia(mediaId);
      if (!record || !owns(account, record)) return false;
      await discard(record);
      return true;
    },

    async forget(userId) {
      const own = await records.listStored({ userId, workspaceId: null });
      for (const record of own) await discard(record);
      return own.length;
    },

    sweep: () => sweep(SWEEP),
  };
}

/** Upload records held in memory, for tests and for a client that was given no store. */
export function memoryUploadRecords(): UploadRecords {
  const rows = new Map<string, UploadRecord>();
  const newestFirst = (a: UploadRecord, b: UploadRecord): number => b.created_at.localeCompare(a.created_at);
  return {
    async insert(record) {
      rows.set(record.id, { ...record });
    },
    async find(id) {
      const row = rows.get(id);
      return row ? { ...row } : null;
    },
    async findStoredMedia(mediaId) {
      const row = [...rows.values()].find((entry) => entry.media_id === mediaId && entry.state === "stored");
      return row ? { ...row } : null;
    },
    async markStored(id) {
      const row = rows.get(id);
      if (!row) return null;
      row.state = "stored";
      return { ...row };
    },
    async listStored(account) {
      return [...rows.values()]
        .filter((row) => row.state === "stored" && (account.workspaceId ? row.workspace_id === account.workspaceId : row.workspace_id === null && row.user_id === account.userId))
        .sort(newestFirst)
        .map((row) => ({ ...row }));
    },
    async abandoned(at, limit) {
      return [...rows.values()]
        .filter((row) => row.state === "pending" && Date.parse(row.expires_at) < at.getTime())
        .sort((a, b) => a.expires_at.localeCompare(b.expires_at))
        .slice(0, limit)
        .map((row) => ({ ...row }));
    },
    async delete(id) {
      rows.delete(id);
    },
  };
}

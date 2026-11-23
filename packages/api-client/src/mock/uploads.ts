import type { MediaFile, MediaItem, UploadRequest, UploadTicket } from "../types";
import { addMediaToLibrary } from "./library";
import { shared, type Owner } from "./shared";

/** Why a file was turned away, in words for the person who chose it. */
export class UploadRefused extends Error {
  readonly code: "unsupported_type" | "too_large" | "empty";

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

/** How long a ticket is good for. */
const TICKET_MS = 15 * 60_000;
/** How many pictures the mock keeps to show. Older ones stay in the library and fall back to their artwork. */
const KEPT_FILES = 24;

const tickets = shared("uploads.tickets", () => new Map<string, { request: UploadRequest; expiresAt: number; owner: Owner | null }>());
const files = shared("uploads.files", () => new Map<string, MediaFile>());

function token(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "");
}

/** A steady colour wash for a tile with no still, from the file's name. */
function artworkFor(name: string): MediaItem["artwork"] {
  let seed = 0;
  for (const letter of name) seed = (seed * 31 + letter.charCodeAt(0)) % 9973;
  return { hues: [seed % 360, (seed * 7) % 360, (seed * 13) % 360], seed: (seed % 40) + 1 };
}

function titleFor(name: string, kind: UploadRequest["kind"]): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return kind === "image" ? "Uploaded picture" : "Uploaded video";
  return base.length > 60 ? `${base.slice(0, 58)}…` : base;
}

/** Checks a file before it is sent and answers with where to send it. */
export function requestStoredUpload(request: UploadRequest, owner: Owner | null = null): UploadTicket {
  const rules = UPLOAD_RULES[request.kind];
  const type = request.content_type.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!(rules.types as readonly string[]).includes(type)) throw new UploadRefused("unsupported_type", rules.say);
  if (!Number.isFinite(request.size_bytes) || request.size_bytes <= 0) throw new UploadRefused("empty", "That file is empty.");
  if (request.size_bytes > rules.maxBytes) throw new UploadRefused("too_large", rules.say);
  const now = Date.now();
  for (const [id, ticket] of tickets) if (ticket.expiresAt < now) tickets.delete(id);
  const id = `upl_${token()}`;
  tickets.set(id, { request: { ...request, content_type: type }, expiresAt: now + TICKET_MS, owner });
  return { id, path: `/api/v1/uploads/${id}`, max_bytes: rules.maxBytes, expires_at: new Date(now + TICKET_MS).toISOString() };
}

/**
 * Takes the file a ticket was given for and adds it to the library. Null when the ticket is unknown, used or
 * out of date. The mock keeps a picture so it can be shown; of a video it records only that it arrived.
 */
export function receiveStoredUpload(id: string, bytes: Uint8Array): MediaItem | null {
  const ticket = tickets.get(id);
  if (!ticket || ticket.expiresAt < Date.now()) return null;
  const { request } = ticket;
  if (bytes.byteLength === 0) throw new UploadRefused("empty", "That file is empty.");
  if (bytes.byteLength > UPLOAD_RULES[request.kind].maxBytes) throw new UploadRefused("too_large", UPLOAD_RULES[request.kind].say);
  tickets.delete(id);

  const mediaId = `med_${token()}`;
  if (request.kind === "image") {
    files.set(mediaId, { content_type: request.content_type, bytes });
    for (const oldest of files.keys()) {
      if (files.size <= KEPT_FILES) break;
      files.delete(oldest);
    }
  }
  const item: MediaItem = {
    id: mediaId,
    kind: request.kind,
    source: "upload",
    title: titleFor(request.name, request.kind),
    description: request.kind === "image" ? "A picture you uploaded." : "A video you uploaded.",
    tags: [],
    app: null,
    prompt: null,
    aspect: request.aspect ?? "16:9",
    duration_seconds: null,
    created_at: new Date().toISOString(),
    image: request.kind === "image" ? `/api/media/${mediaId}` : null,
    artwork: artworkFor(request.name),
    made_by: ticket.owner?.by ?? null,
  };
  // The file goes to the library of the account that asked to send it.
  addMediaToLibrary(item, ticket.owner);
  return item;
}

/** The file behind a library item's still, when the mock kept one. */
export function readStoredMediaFile(mediaId: string): MediaFile | null {
  return files.get(mediaId) ?? null;
}

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, constants, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { StorageUnavailable, type ObjectStorage } from "./types";

export interface DiskConfig {
  /** Where files are kept. */
  dir: string;
  /** Keys the signatures on the addresses this driver gives out. */
  secret: string;
  /** The instance's route that takes and serves files for this driver. */
  basePath: string;
  now?: () => number;
}

/** A file sent to an address this driver signed. */
export interface DiskUpload {
  key: string;
  query: URLSearchParams;
  contentType: string | null;
  body: ReadableStream<Uint8Array> | null;
}

/** A file ready to be sent back. */
export interface DiskFile {
  body: ReadableStream<Uint8Array>;
  size: number;
  contentType: string;
}

/**
 * Storage on the instance's own disk, for an instance that was given none to use: development, tests and a
 * first look. It keeps the contract of a storage service, so the same clients and the same three steps work
 * against it: an address it signs is good for one key, one method, one length and type, and a few minutes.
 * The instance's route hands it the request (`receive`, `open`); a file is streamed to and from disk and
 * never held in memory.
 */
export interface DiskStorage extends ObjectStorage {
  /** Takes a file sent to a signed address. Answers with the HTTP status to give. */
  receive(upload: DiskUpload): Promise<200 | 400 | 403 | 413>;
  /** Opens the file a signed address is for. Null when the address isn't good or nothing is there. */
  open(key: string, query: URLSearchParams): Promise<DiskFile | null>;
}

/** Keys are made by the instance, never by a client; this is what one may look like, so none can leave the directory. */
const KEY = /^[A-Za-z0-9][A-Za-z0-9_-]*(\/[A-Za-z0-9][A-Za-z0-9_-]*)*$/;

export function diskStorage(config: DiskConfig): DiskStorage {
  const now = config.now ?? Date.now;
  const fileOf = (key: string): string => {
    if (!KEY.test(key)) throw new Error("Not a storage key.");
    return path.join(config.dir, ...key.split("/"));
  };
  const typeOf = (file: string): string => `${file}.type`;

  const signature = (method: "GET" | "PUT", key: string, expires: number, length: string, type: string): string =>
    createHmac("sha256", config.secret).update([method, key, expires, length, type].join("\n")).digest("base64url");
  /** Whether an address carries this driver's signature for a method and key, and is still in date. */
  const signed = (method: "GET" | "PUT", key: string, query: URLSearchParams): boolean => {
    const expires = Number(query.get("expires"));
    if (!KEY.test(key) || !Number.isFinite(expires) || expires * 1000 < now()) return false;
    const given = Buffer.from(query.get("signature") ?? "");
    const expected = Buffer.from(signature(method, key, expires, query.get("length") ?? "", query.get("type") ?? ""));
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  const expiry = (seconds: number): number => Math.floor(now() / 1000) + seconds;

  return {
    kind: "disk",
    async signPut(key, { contentType, contentLength, expiresInSeconds }) {
      const reason = await this.check();
      if (reason !== "ok") throw new StorageUnavailable(`Files can't be kept here: ${reason}.`);
      const expires = expiry(expiresInSeconds);
      const query = new URLSearchParams({ expires: String(expires), length: String(contentLength), type: contentType, signature: signature("PUT", key, expires, String(contentLength), contentType) });
      return { url: `${config.basePath}/${key}?${query}`, method: "PUT", headers: { "Content-Type": contentType } };
    },
    async signGet(key, { expiresInSeconds }) {
      const expires = expiry(expiresInSeconds);
      return `${config.basePath}/${key}?${new URLSearchParams({ expires: String(expires), signature: signature("GET", key, expires, "", "") })}`;
    },
    async head(key) {
      const file = fileOf(key);
      try {
        const [held, contentType] = await Promise.all([stat(file), readFile(typeOf(file), "utf8")]);
        return { size: held.size, contentType };
      } catch {
        return null;
      }
    },
    async remove(key) {
      const file = fileOf(key);
      await Promise.all([rm(file, { force: true }), rm(typeOf(file), { force: true })]);
    },
    async check() {
      try {
        await mkdir(config.dir, { recursive: true, mode: 0o700 });
        await access(config.dir, constants.W_OK);
        return "ok";
      } catch {
        return `${config.dir} can't be written to`;
      }
    },

    async receive({ key, query, contentType, body }) {
      if (!signed("PUT", key, query)) return 403;
      const length = Number(query.get("length"));
      if ((contentType ?? "").split(";")[0]?.trim().toLowerCase() !== query.get("type") || !body) return 400;
      const file = fileOf(key);
      const part = `${file}.${randomUUID()}.part`;
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      let seen = 0;
      const out = createWriteStream(part, { mode: 0o600 });
      try {
        for await (const chunk of Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>)) {
          seen += (chunk as Uint8Array).byteLength;
          // More than the address was signed for: stop reading, keep nothing.
          if (seen > length) break;
          if (!out.write(chunk)) await new Promise<void>((resolve) => out.once("drain", () => resolve()));
        }
        await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
        if (seen !== length) {
          await rm(part, { force: true });
          return seen > length ? 413 : 400;
        }
        await writeFile(typeOf(file), query.get("type") ?? "", { mode: 0o600 });
        await rename(part, file);
        return 200;
      } catch (cause) {
        out.destroy();
        await rm(part, { force: true });
        throw cause;
      }
    },
    async open(key, query) {
      if (!signed("GET", key, query)) return null;
      const held = await this.head(key);
      if (!held) return null;
      return { body: Readable.toWeb(createReadStream(fileOf(key))) as unknown as ReadableStream<Uint8Array>, size: held.size, contentType: held.contentType };
    },
  };
}

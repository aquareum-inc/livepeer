import type { ObjectStorage } from "./types";

/** Storage held in memory, with a way to put a file in it as a client would. For tests. */
export interface MemoryStorage extends ObjectStorage {
  /** What a client's PUT does: keeps the file, if it is the length and type its address was signed for. */
  put(url: string, bytes: Uint8Array, contentType: string): boolean;
  /** Keeps a file whatever was signed, as a client could not: for testing what the server does about it. */
  force(key: string, bytes: Uint8Array, contentType: string): void;
  keys(): string[];
}

export function memoryStorage(): MemoryStorage {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const signed = new Map<string, { key: string; contentType: string; contentLength: number }>();
  return {
    kind: "memory",
    async signPut(key, { contentType, contentLength }) {
      const url = `memory://storage/${key}?signature=${signed.size + 1}`;
      signed.set(url, { key, contentType, contentLength });
      return { url, method: "PUT", headers: { "Content-Type": contentType } };
    },
    async signGet(key) {
      return `memory://storage/${key}`;
    },
    async head(key) {
      const held = objects.get(key);
      return held ? { size: held.bytes.byteLength, contentType: held.contentType } : null;
    },
    async remove(key) {
      objects.delete(key);
    },
    async check() {
      return "ok";
    },
    put(url, bytes, contentType) {
      const leave = signed.get(url);
      if (!leave || leave.contentType !== contentType || leave.contentLength !== bytes.byteLength) return false;
      objects.set(leave.key, { bytes, contentType });
      return true;
    },
    force(key, bytes, contentType) {
      objects.set(key, { bytes, contentType });
    },
    keys: () => [...objects.keys()],
  };
}

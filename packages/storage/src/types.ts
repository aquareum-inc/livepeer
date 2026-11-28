/** Where to send one file, and how: an address that is its own permission, for a few minutes. */
export interface SignedUpload {
  /** Absolute, or starting with "/" when the instance itself stands in for storage. */
  url: string;
  method: "PUT";
  /** Headers to send with the file, exactly as given. The length is the file's own and needs no header here. */
  headers: Record<string, string>;
}

/** What storage holds under a key. */
export interface StoredObject {
  size: number;
  contentType: string;
}

/**
 * Where the instance keeps files. Everything above this line (tickets, the library, the routes) is the same
 * whichever driver is behind it. The server never sends or receives a file's bytes through this interface:
 * it signs addresses for clients, and asks what arrived.
 */
export interface ObjectStorage {
  readonly kind: "s3" | "disk" | "memory";
  /** An address a client may PUT one file to. The signature covers the media type and the exact length. */
  signPut(key: string, options: { contentType: string; contentLength: number; expiresInSeconds: number }): Promise<SignedUpload>;
  /** An address a client may GET one file from. */
  signGet(key: string, options: { expiresInSeconds: number }): Promise<string>;
  /** What is held under a key, or null when nothing is. */
  head(key: string): Promise<StoredObject | null>;
  /** Removes what is held under a key. Removing nothing is not an error. */
  remove(key: string): Promise<void>;
  /** Whether storage can be used, or why not, in words for an operator. */
  check(): Promise<"ok" | string>;
}

/** Storage can't be used right now: not set up, not reachable, or refusing the instance's key. */
export class StorageUnavailable extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StorageUnavailable";
  }
}

import "server-only";

/** A device session as the instance keeps it. The token itself is never stored, only a keyed hash. */
export interface DeviceRecord {
  id: string;
  tokenHash: string;
  userId: string;
  name: string;
  email: string | null;
  /**
   * Whether the provider marked them an operator at sign-in. It only tells the app whether to offer the
   * console; a device session never does operator work. Absent on sessions made before it was recorded.
   */
  role?: "user" | "operator";
  deviceName: string;
  platform: "ios" | "android";
  /** The user's builder key, sealed with SESSION_SECRET, as the browser session cookie holds it. */
  builderKey: string | null;
  /**
   * The workspace the app is working in, or absent for the personal account. Only a pointer, as in the
   * browser's session cookie: membership is asked of the provider on every request.
   */
  workspaceId?: string | null;
  createdAt: string;
  lastUsedAt: string;
}

/** A finished sign-in waiting for its app to collect it. Single use, and short-lived. */
export interface PendingCode {
  codeHash: string;
  /** The PKCE challenge the app sent when it started: base64url(SHA-256(verifier)). */
  challenge: string;
  platform: "ios" | "android";
  userId: string;
  name: string;
  email: string | null;
  role?: "user" | "operator";
  builderKey: string | null;
  expiresAt: number;
}

/**
 * Where device sessions live: revocation needs state. It holds sessions and pending sign-ins only, never
 * balances. One method per thing the sessions need of it, so a database can answer each with one statement.
 */
export interface DeviceSessionStore {
  putCode(code: PendingCode): Promise<void>;
  /** Hands a pending sign-in over and forgets it, so it can only ever be collected once. */
  takeCode(codeHash: string): Promise<PendingCode | null>;
  createSession(record: DeviceRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<DeviceRecord | null>;
  /** Notes when a session was last used. */
  touch(id: string, at: string): Promise<void>;
  listForUser(userId: string): Promise<DeviceRecord[]>;
  /** False when there is no such session. */
  setWorkspace(id: string, workspaceId: string | null): Promise<boolean>;
  /** Ends one of a user's sessions, or all of them. Answers with how many ended. */
  remove(by: { id: string; userId: string } | { userId: string }): Promise<number>;
  /** Drops sign-ins nobody collected by `now` and sessions not used since `idleSince`. */
  sweep(input: { now: number; idleSince: string }): Promise<void>;
}

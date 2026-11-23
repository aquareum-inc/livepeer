import "server-only";

import { jsonFileStore } from "../data/json-file";
import type { StateStore } from "../data/store";

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

export interface Contents {
  sessions: DeviceRecord[];
  codes: PendingCode[];
}

/** Where device sessions live: revocation needs state. It holds sessions and pending sign-ins only, never balances. */
export type DeviceSessionStore = StateStore<Contents>;

export function fileDeviceSessionStore(): DeviceSessionStore {
  return jsonFileStore<Contents>("device-sessions.json", (value) => ({ sessions: value.sessions ?? [], codes: value.codes ?? [] }));
}

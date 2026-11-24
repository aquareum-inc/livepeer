import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { DeviceSession, DeviceToken } from "@livepeer/api-client";

import type { Identity } from "../auth/types";
import type { DeviceRecord, DeviceSessionStore } from "./store";

/** Device session tokens start with this, so a leaked one is recognisable and the API can tell it from a key. */
export const DEVICE_TOKEN_PREFIX = "aqd_";
/** A session ends after this long without use. There is no refresh token: the token is the session. */
export const IDLE_DAYS = 90;
/** How long a finished sign-in waits for its app to collect it. */
export const CODE_SECONDS = 60;
/** Last-used times are written at most this often, so most requests write nothing. */
const TOUCH_MS = 60 * 60 * 1000;

export type Platform = DeviceRecord["platform"];

export interface DeviceSessions {
  /** Called at the end of a native sign-in: holds the identity for the app to collect with its verifier. */
  issueCode(input: { identity: Identity; builderKey: string | null; challenge: string; platform: Platform }): Promise<string>;
  /** The app collects its sign-in. Null when the code is unknown, used, expired or the verifier doesn't match. */
  redeemCode(input: { code: string; verifier: string; deviceName: string; platform: Platform }): Promise<DeviceToken | null>;
  /** The session a token belongs to, if it is still valid. Marks it used. */
  find(token: string): Promise<DeviceRecord | null>;
  list(userId: string, currentId: string | null): Promise<DeviceSession[]>;
  /** Points a session at a workspace, or at the personal account with null. False when there is no such session. */
  setWorkspace(id: string, workspaceId: string | null): Promise<boolean>;
  /** Ends one of the user's sessions. False when it isn't theirs or doesn't exist. */
  revoke(userId: string, id: string): Promise<boolean>;
  /** Ends every session the user has, for example when they are suspended. */
  revokeAll(userId: string): Promise<number>;
  /** Drops sign-ins nobody collected and sessions idle past their end. */
  sweep(): Promise<void>;
}

const base64url = (bytes: Buffer) => bytes.toString("base64url");
const sha256 = (value: string) => createHash("sha256").update(value).digest();

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function toDeviceSession(record: DeviceRecord, currentId: string | null): DeviceSession {
  return { id: record.id, name: record.deviceName, platform: record.platform, created_at: record.createdAt, last_used_at: record.lastUsedAt, current: record.id === currentId };
}

/**
 * Device sessions for the native apps. Tokens and codes are stored as an HMAC keyed with the session
 * secret, so the store alone can't be used to sign in, and rotating SESSION_SECRET ends every session, as
 * it does for browser sessions. A stored hash is looked up by equality: it is keyed, so how long the lookup
 * takes tells a caller nothing about a token they don't hold.
 */
export function deviceSessions(store: DeviceSessionStore, secret: string, now: () => number = Date.now): DeviceSessions {
  const hash = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");
  const expired = (record: DeviceRecord) => Date.parse(record.lastUsedAt) + IDLE_DAYS * 86_400_000 <= now();
  /** What has lapsed goes whenever a sign-in starts or finishes, so nothing has to run between requests for it. */
  const sweep = () => store.sweep({ now: now(), idleSince: new Date(now() - IDLE_DAYS * 86_400_000).toISOString() });

  return {
    async issueCode({ identity, builderKey, challenge, platform }) {
      const code = base64url(randomBytes(32));
      await sweep();
      await store.putCode({ codeHash: hash(code), challenge, platform, userId: identity.userId, name: identity.name, email: identity.email, role: identity.role, builderKey, expiresAt: now() + CODE_SECONDS * 1000 });
      return code;
    },

    async redeemCode({ code, verifier, deviceName, platform }) {
      // A code is single use: it goes whether or not the exchange succeeds.
      const pending = await store.takeCode(hash(code));
      await sweep();
      if (!pending || pending.expiresAt <= now() || pending.platform !== platform) return null;
      if (!same(base64url(sha256(verifier)), pending.challenge)) return null;

      const token = `${DEVICE_TOKEN_PREFIX}${base64url(randomBytes(32))}`;
      const stamp = new Date(now()).toISOString();
      const record: DeviceRecord = {
        id: `dev_${base64url(randomBytes(9))}`,
        tokenHash: hash(token),
        userId: pending.userId,
        name: pending.name,
        email: pending.email,
        role: pending.role ?? "user",
        deviceName: deviceName.trim().slice(0, 80) || (platform === "ios" ? "iPhone" : "Android phone"),
        platform,
        builderKey: pending.builderKey,
        createdAt: stamp,
        lastUsedAt: stamp,
      };
      await store.createSession(record);
      return { token, device: toDeviceSession(record, record.id) };
    },

    async find(token) {
      if (!token.startsWith(DEVICE_TOKEN_PREFIX)) return null;
      const record = await store.findByTokenHash(hash(token));
      if (!record || expired(record)) return null;
      if (now() - Date.parse(record.lastUsedAt) < TOUCH_MS) return record;
      const lastUsedAt = new Date(now()).toISOString();
      await store.touch(record.id, lastUsedAt);
      return { ...record, lastUsedAt };
    },

    async list(userId, currentId) {
      return (await store.listForUser(userId))
        .filter((entry) => !expired(entry))
        .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
        .map((entry) => toDeviceSession(entry, currentId));
    },

    setWorkspace: (id, workspaceId) => store.setWorkspace(id, workspaceId),

    revoke: async (userId, id) => (await store.remove({ id, userId })) > 0,

    revokeAll: (userId) => store.remove({ userId }),

    sweep,
  };
}

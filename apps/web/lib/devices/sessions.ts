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
/** Last-used times are written at most this often, so every request doesn't rewrite the file. */
const TOUCH_MS = 60 * 60 * 1000;

export type Platform = DeviceRecord["platform"];

export interface DeviceSessions {
  /** Called at the end of a native sign-in: holds the identity for the app to collect with its verifier. */
  issueCode(input: { identity: Identity; builderKey: string | null; challenge: string; platform: Platform }): string;
  /** The app collects its sign-in. Null when the code is unknown, used, expired or the verifier doesn't match. */
  redeemCode(input: { code: string; verifier: string; deviceName: string; platform: Platform }): DeviceToken | null;
  /** The session a token belongs to, if it is still valid. Marks it used. */
  find(token: string): DeviceRecord | null;
  list(userId: string, currentId: string | null): DeviceSession[];
  /** Points a session at a workspace, or at the personal account with null. False when there is no such session. */
  setWorkspace(id: string, workspaceId: string | null): boolean;
  /** Ends one of the user's sessions. False when it isn't theirs or doesn't exist. */
  revoke(userId: string, id: string): boolean;
  /** Ends every session the user has, for example when they are suspended. */
  revokeAll(userId: string): number;
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
 * it does for browser sessions.
 */
export function deviceSessions(store: DeviceSessionStore, secret: string, now: () => number = Date.now): DeviceSessions {
  const hash = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");
  const expired = (record: DeviceRecord) => Date.parse(record.lastUsedAt) + IDLE_DAYS * 86_400_000 <= now();

  return {
    issueCode({ identity, builderKey, challenge, platform }) {
      const code = base64url(randomBytes(32));
      store.update((contents) => {
        contents.codes = contents.codes.filter((entry) => entry.expiresAt > now());
        contents.codes.push({ codeHash: hash(code), challenge, platform, userId: identity.userId, name: identity.name, email: identity.email, role: identity.role, builderKey, expiresAt: now() + CODE_SECONDS * 1000 });
      });
      return code;
    },

    redeemCode({ code, verifier, deviceName, platform }) {
      return store.update((contents) => {
        const codeHash = hash(code);
        const pending = contents.codes.find((entry) => same(entry.codeHash, codeHash));
        // A code is single use: it goes whether or not the exchange succeeds.
        contents.codes = contents.codes.filter((entry) => entry !== pending && entry.expiresAt > now());
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
        contents.sessions = contents.sessions.filter((entry) => !expired(entry));
        contents.sessions.push(record);
        return { token, device: toDeviceSession(record, record.id) };
      });
    },

    find(token) {
      if (!token.startsWith(DEVICE_TOKEN_PREFIX)) return null;
      const tokenHash = hash(token);
      const record = store.read().sessions.find((entry) => same(entry.tokenHash, tokenHash));
      if (!record || expired(record)) return null;
      if (now() - Date.parse(record.lastUsedAt) < TOUCH_MS) return record;
      const lastUsedAt = new Date(now()).toISOString();
      store.update((contents) => {
        const stored = contents.sessions.find((entry) => entry.id === record.id);
        if (stored) stored.lastUsedAt = lastUsedAt;
      });
      return { ...record, lastUsedAt };
    },

    list(userId, currentId) {
      return store
        .read()
        .sessions.filter((entry) => entry.userId === userId && !expired(entry))
        .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
        .map((entry) => toDeviceSession(entry, currentId));
    },

    setWorkspace(id, workspaceId) {
      return store.update((contents) => {
        const stored = contents.sessions.find((entry) => entry.id === id);
        if (stored) stored.workspaceId = workspaceId;
        return stored !== undefined;
      });
    },

    revoke(userId, id) {
      return store.update((contents) => {
        const before = contents.sessions.length;
        contents.sessions = contents.sessions.filter((entry) => !(entry.id === id && entry.userId === userId));
        return contents.sessions.length < before;
      });
    },

    revokeAll(userId) {
      return store.update((contents) => {
        const before = contents.sessions.length;
        contents.sessions = contents.sessions.filter((entry) => entry.userId !== userId);
        return before - contents.sessions.length;
      });
    },
  };
}

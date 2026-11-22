import "server-only";

import type { OperatorAlertKind, OperatorAuditEntry } from "@livepeer/api-client";

import { jsonFileStore } from "../data/json-file";
import type { StateStore } from "../data/store";

/**
 * An operator device session as the instance keeps it. The token is never stored, only a keyed hash, and
 * there is no builder key: this session can't run a job or spend credit.
 */
export interface OperatorDeviceRecord {
  id: string;
  tokenHash: string;
  userId: string;
  name: string;
  email: string | null;
  deviceName: string;
  platform: "ios" | "android";
  /** The phone's P-256 public key, as base64 of its SubjectPublicKeyInfo. The private half never leaves the phone. */
  publicKey: string;
  createdAt: string;
  lastUsedAt: string;
  lastUnlockedAt: string | null;
  /** Unix milliseconds until which reads are allowed. 0 while locked. */
  unlockedUntil: number;
  /** Proofs refused in a row. The session is revoked when this reaches the limit. */
  failedProofs: number;
  /** Alerts on this phone, or null while they are off. They end with the record, however it ends. */
  alerts: PhoneAlerts | null;
}

/** What a phone asked to be told, and where to send it. */
export interface PhoneAlerts {
  kinds: OperatorAlertKind[];
  /**
   * The push token, sealed with the session secret: unlike a session token it can't be kept as a hash,
   * because the instance has to send to it. Null once Apple or Google has said it is dead.
   */
  pushSealed: string | null;
  /** A keyed hash of the push token, to find a phone that registered again without unsealing every record. */
  pushHash: string;
  /** Which of Apple's services issued it. Android has one. */
  environment: "production" | "development";
  setAt: string;
  lastAlertAt: string | null;
  /** When the phone was told its alerts are about to end. */
  warnedAt: string | null;
}

/** A finished operator sign-in waiting for its app to collect it. Single use, and short-lived. */
export interface PendingOperatorCode {
  codeHash: string;
  /** The PKCE challenge the app sent when it started: base64url(SHA-256(verifier)). */
  challenge: string;
  platform: "ios" | "android";
  userId: string;
  name: string;
  email: string | null;
  expiresAt: number;
}

/** A nonce a phone was given to sign. Single use, and short-lived. */
export interface PendingChallenge {
  nonceHash: string;
  sessionId: string;
  /** Null for an unlock. For a change: the one operation and input the proof is good for. */
  operation: string | null;
  inputHash: string | null;
  expiresAt: number;
}

export interface OperatorDeviceContents {
  sessions: OperatorDeviceRecord[];
  codes: PendingOperatorCode[];
  challenges: PendingChallenge[];
}

export type OperatorDeviceStore = StateStore<OperatorDeviceContents>;

/** Operator device sessions live in their own file, apart from users' device sessions. */
export function fileOperatorDeviceStore(): OperatorDeviceStore {
  return jsonFileStore<OperatorDeviceContents>("operator-device-sessions.json", (value) => ({
    // Records written before alerts existed have none.
    sessions: (value.sessions ?? []).map((session) => ({ ...session, alerts: session.alerts ?? null })),
    codes: value.codes ?? [],
    challenges: value.challenges ?? [],
  }));
}

export interface AuditContents {
  entries: OperatorAuditEntry[];
}

export type AuditStore = StateStore<AuditContents>;

export function fileAuditStore(): AuditStore {
  return jsonFileStore<AuditContents>("operator-audit.json", (value) => ({ entries: value.entries ?? [] }));
}

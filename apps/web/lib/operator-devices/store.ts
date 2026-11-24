import "server-only";

import type { OperatorAlertKind, OperatorAuditEntry } from "@livepeer/api-client";

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

/** Which sessions a removal takes. */
export type OperatorSessionsGone = { ids: readonly string[] } | { userId: string } | "all";

/**
 * Where operator device sessions live, apart from users' device sessions. One method per thing the sessions
 * need of it. The rules (which session still counts, what a proof must match) stay with the sessions; the
 * store only keeps, finds and removes.
 */
export interface OperatorDeviceStore {
  putCode(code: PendingOperatorCode): Promise<void>;
  /** Hands a pending sign-in over and forgets it, so it can only ever be collected once. */
  takeCode(codeHash: string): Promise<PendingOperatorCode | null>;
  createSession(record: OperatorDeviceRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<OperatorDeviceRecord | null>;
  /** Every session, in no order. Operators' phones are few, so the rules are applied to the whole list. */
  sessions(): Promise<OperatorDeviceRecord[]>;
  /** Notes when a session was last used. */
  touch(id: string, at: string): Promise<void>;
  /** Opens reads until `until` and forgets refused proofs. False when there is no such session. */
  unlock(id: string, input: { until: number; at: string }): Promise<boolean>;
  /** Counts a refused proof. Answers with how many there have been in a row, or 0 when there is no such session. */
  failedProof(id: string): Promise<number>;
  /** False when there is no such session. */
  clearFailedProofs(id: string): Promise<boolean>;
  /**
   * Counts a request against a session in the minute given (minutes since 1970), and answers with how many
   * it has made in that minute.
   */
  countRequest(id: string, minute: number): Promise<number>;
  /** Removes sessions with the nonces waiting for them and their alerts, and answers with the sessions, alerts off. */
  remove(gone: OperatorSessionsGone): Promise<OperatorDeviceRecord[]>;
  /** Keeps a nonce for its session, which holds at most `keep` at once: the oldest go first. */
  putChallenge(challenge: PendingChallenge, keep: number): Promise<void>;
  /** Hands a session's nonce over and forgets it, so it can never be presented twice. */
  takeChallenge(sessionId: string, nonceHash: string): Promise<PendingChallenge | null>;
  /**
   * Turns a phone's alerts on, or off with null, and answers with the session as it then stands (null when
   * there is none). A push token belongs to one phone: any other session holding the same one loses it. When
   * the phone last heard an alert is kept across a change of token.
   */
  setAlerts(id: string, alerts: Omit<PhoneAlerts, "lastAlertAt"> | null): Promise<OperatorDeviceRecord | null>;
  /** Forgets a push token that no longer works. Alerts stay on, reaching nothing, until the phone registers again. */
  dropPushToken(id: string): Promise<void>;
  clearAlerts(ids: readonly string[]): Promise<void>;
  /** Notes that alerts reached these phones. */
  alerted(ids: readonly string[], at: string): Promise<void>;
  /** Notes that these phones were told their alerts are about to end. */
  warned(ids: readonly string[], at: string): Promise<void>;
  /**
   * Notes that an operator closed the notice that these phones were added. Kept by the operator's id and the
   * session's, once each; a session that is gone is passed over. The rows go when the session goes.
   */
  dismissNotice(userId: string, sessionIds: readonly string[], at: string): Promise<void>;
  /** The sessions whose notice this operator has closed. */
  noticesDismissedBy(userId: string): Promise<string[]>;
  /** Drops sign-ins nobody collected and nonces nobody signed by `now`. */
  sweep(now: number): Promise<void>;
}

/** Where the record of what operators' phones did is kept. */
export interface AuditStore {
  /** Adds an entry, and keeps only the newest `keep`. */
  append(entry: OperatorAuditEntry, keep: number): Promise<void>;
  /** The newest entries, newest first. */
  newest(limit: number): Promise<OperatorAuditEntry[]>;
  /** How many entries of one kind a phone has since a time, among those whose detail starts a given way. */
  countSince(input: { event: OperatorAuditEntry["event"]; deviceId: string; detailStartsWith: string; since: string }): Promise<number>;
}

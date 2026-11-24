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
  /** Removes sessions with the nonces waiting for them and their alerts, and answers with what it removed. */
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
  /** Drops sign-ins nobody collected and nonces nobody signed by `now`. */
  sweep(now: number): Promise<void>;
}

/** Operator device sessions kept as one document: a JSON file, or memory in tests. */
export function documentOperatorDeviceStore(document: StateStore<OperatorDeviceContents>): OperatorDeviceStore {
  /** Changes the sessions named, where they exist. */
  const each = (ids: readonly string[], change: (record: OperatorDeviceRecord) => void): void => {
    if (ids.length === 0) return;
    document.update((contents) => {
      for (const record of contents.sessions) if (ids.includes(record.id)) change(record);
    });
  };
  const one = <R>(id: string, change: (record: OperatorDeviceRecord) => R, missing: R): R =>
    document.update((contents) => {
      const record = contents.sessions.find((entry) => entry.id === id);
      return record ? change(record) : missing;
    });

  return {
    async putCode(code) {
      document.update((contents) => {
        contents.codes.push(code);
      });
    },
    async takeCode(codeHash) {
      return document.update((contents) => {
        const pending = contents.codes.find((entry) => entry.codeHash === codeHash) ?? null;
        contents.codes = contents.codes.filter((entry) => entry !== pending);
        return pending;
      });
    },
    async createSession(record) {
      document.update((contents) => {
        contents.sessions.push(record);
      });
    },
    async findByTokenHash(tokenHash) {
      return document.read().sessions.find((entry) => entry.tokenHash === tokenHash) ?? null;
    },
    async sessions() {
      return document.read().sessions;
    },
    async touch(id, at) {
      each([id], (record) => {
        record.lastUsedAt = at;
      });
    },
    async unlock(id, { until, at }) {
      return one(
        id,
        (record) => {
          record.unlockedUntil = until;
          record.lastUnlockedAt = at;
          record.failedProofs = 0;
          return true;
        },
        false,
      );
    },
    async failedProof(id) {
      return one(id, (record) => (record.failedProofs += 1), 0);
    },
    async clearFailedProofs(id) {
      return one(
        id,
        (record) => {
          record.failedProofs = 0;
          return true;
        },
        false,
      );
    },
    async remove(gone) {
      return document.update((contents) => {
        const removed = contents.sessions.filter((record) => gone === "all" || ("ids" in gone ? gone.ids.includes(record.id) : record.userId === gone.userId));
        const ids = new Set(removed.map((record) => record.id));
        contents.sessions = contents.sessions.filter((record) => !ids.has(record.id));
        contents.challenges = contents.challenges.filter((entry) => !ids.has(entry.sessionId));
        return removed;
      });
    },
    async putChallenge(challenge, keep) {
      document.update((contents) => {
        const waiting = contents.challenges.filter((entry) => entry.sessionId === challenge.sessionId);
        const dropped = new Set(waiting.slice(0, Math.max(0, waiting.length - (keep - 1))));
        contents.challenges = contents.challenges.filter((entry) => !dropped.has(entry));
        contents.challenges.push(challenge);
      });
    },
    async takeChallenge(sessionId, nonceHash) {
      return document.update((contents) => {
        const pending = contents.challenges.find((entry) => entry.sessionId === sessionId && entry.nonceHash === nonceHash) ?? null;
        contents.challenges = contents.challenges.filter((entry) => entry !== pending);
        return pending;
      });
    },
    async setAlerts(id, alerts) {
      return document.update((contents) => {
        const record = contents.sessions.find((entry) => entry.id === id);
        if (!record) return null;
        if (alerts) for (const other of contents.sessions) if (other.id !== id && other.alerts?.pushHash === alerts.pushHash) other.alerts = null;
        record.alerts = alerts ? { ...alerts, lastAlertAt: record.alerts?.lastAlertAt ?? null } : null;
        return record;
      });
    },
    async dropPushToken(id) {
      each([id], (record) => {
        if (record.alerts) record.alerts.pushSealed = null;
      });
    },
    async clearAlerts(ids) {
      each(ids, (record) => {
        record.alerts = null;
      });
    },
    async alerted(ids, at) {
      each(ids, (record) => {
        if (record.alerts) record.alerts.lastAlertAt = at;
      });
    },
    async warned(ids, at) {
      each(ids, (record) => {
        if (record.alerts) record.alerts.warnedAt = at;
      });
    },
    async sweep(now) {
      document.update((contents) => {
        contents.codes = contents.codes.filter((entry) => entry.expiresAt > now);
        contents.challenges = contents.challenges.filter((entry) => entry.expiresAt > now);
      });
    },
  };
}

/** Operator device sessions live in their own file, apart from users' device sessions. */
export function fileOperatorDeviceStore(): OperatorDeviceStore {
  return documentOperatorDeviceStore(
    jsonFileStore<OperatorDeviceContents>("operator-device-sessions.json", (value) => ({
      // Records written before alerts existed have none.
      sessions: (value.sessions ?? []).map((session) => ({ ...session, alerts: session.alerts ?? null })),
      codes: value.codes ?? [],
      challenges: value.challenges ?? [],
    })),
  );
}

export interface AuditContents {
  entries: OperatorAuditEntry[];
}

/** Where the record of what operators' phones did is kept. */
export interface AuditStore {
  /** Adds an entry, and keeps only the newest `keep`. */
  append(entry: OperatorAuditEntry, keep: number): Promise<void>;
  /** The newest entries, newest first. */
  newest(limit: number): Promise<OperatorAuditEntry[]>;
}

/** The audit log kept as one document: a JSON file, or memory in tests. */
export function documentAuditStore(document: StateStore<AuditContents>): AuditStore {
  return {
    async append(entry, keep) {
      document.update((contents) => {
        contents.entries.push(entry);
        if (contents.entries.length > keep) contents.entries = contents.entries.slice(-keep);
      });
    },
    async newest(limit) {
      return document.read().entries.slice(-limit).reverse();
    },
  };
}

export function fileAuditStore(): AuditStore {
  return documentAuditStore(jsonFileStore<AuditContents>("operator-audit.json", (value) => ({ entries: value.entries ?? [] })));
}

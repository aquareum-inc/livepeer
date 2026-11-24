import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { OperatorAlertKind, OperatorChallenge, OperatorDeviceSession, OperatorDeviceToken, OperatorPhone, OperatorUnlock } from "@livepeer/api-client";

import { seal, unseal } from "../auth/seal";
import type { Identity } from "../auth/types";
import type { AuditActor, AuditLog } from "./audit";
import { confirmMessage, inputHash, readPublicKey, signed, unlockMessage } from "./proof";
import type { OperatorDeviceRecord, OperatorDeviceStore, OperatorSessionsGone } from "./store";

/** Operator device tokens start with this, so they can never be mistaken for a user's device session (`aqd_`). */
export const OPERATOR_DEVICE_TOKEN_PREFIX = "aqo_";
/** A session ends after this long without use. */
export const IDLE_DAYS = 7;
/** A session ends this long after it was made, however much it is used. */
export const ABSOLUTE_DAYS = 30;
/** How long reads stay open after a face or fingerprint. */
export const UNLOCK_SECONDS = 300;
/** How long a nonce waits to be signed. */
export const CHALLENGE_SECONDS = 60;
/** How long a finished sign-in waits for its app to collect it. */
export const CODE_SECONDS = 60;
/** This many refused proofs in a row revoke the session. */
export const MAX_FAILED_PROOFS = 5;
/** Requests one session may make in a minute. */
export const REQUESTS_PER_MINUTE = 120;
/** Nonces one session may have waiting; asking for more drops the oldest. */
const MAX_PENDING_CHALLENGES = 8;
/** A phone is told this long before its alerts end with its session. */
export const ALERTS_WARNING_DAYS = 3;
/** Last-used times are written at most this often, so most requests write nothing. */
const TOUCH_MS = 60 * 60 * 1000;
/** How long a newly enrolled phone counts as new on the web console. */
export const NEW_PHONE_HOURS = 48;
const DAY_MS = 86_400_000;

type Platform = OperatorDeviceRecord["platform"];

/** A phone to send an alert to. The push token is unsealed only to be handed to Apple or Google. */
export interface AlertTarget {
  sessionId: string;
  userId: string;
  name: string;
  deviceName: string;
  platform: Platform;
  environment: "production" | "development";
  pushToken: string;
}

/** Where alerts stand on one phone. */
export interface PhoneAlertState {
  state: OperatorPhone["alerts"];
  kinds: OperatorAlertKind[];
  /** When they end unless the phone signs in again. */
  until: string | null;
  lastAlertAt: string | null;
}

export interface OperatorDeviceSessions {
  /** Called at the end of an operator's native sign-in. Null for anyone the provider doesn't mark as an operator. */
  issueCode(input: { identity: Identity; challenge: string; platform: Platform }): Promise<string | null>;
  /** The app collects its sign-in and enrols its key. Null when the code, the verifier or the key isn't good. */
  redeemCode(input: { code: string; verifier: string; deviceName: string; platform: Platform; publicKey: string }): Promise<OperatorDeviceToken | null>;
  /** The session a token belongs to, if it is inside both expiries. Marks it used. */
  find(token: string): Promise<OperatorDeviceRecord | null>;
  /** Counts a request against the session's limit. False once it is over. */
  allow(sessionId: string): Promise<boolean>;
  /** Whether the session's last unlock still stands. */
  unlocked(session: OperatorDeviceRecord): boolean;
  /** A nonce to sign: for an unlock, or for one operation and one input. */
  challenge(session: OperatorDeviceRecord, change: { operation: string; inputHash: string } | null): Promise<OperatorChallenge>;
  /** Opens reads for a few minutes. Null when the signature isn't this phone's over an unused unlock nonce. */
  unlock(session: OperatorDeviceRecord, nonce: string, signature: string): Promise<OperatorUnlock | null>;
  /** Whether `proof` (`<nonce>.<signature>`) is this phone's, unused, in time and for exactly this operation and input. */
  prove(session: OperatorDeviceRecord, operation: string, input: Record<string, unknown>, proof: string): Promise<boolean>;
  /**
   * Every operator phone, most recently used first. A phone whose console has idled out stays on the list,
   * marked signed out, for as long as alerts still reach it.
   */
  list(): Promise<OperatorPhone[]>;
  /**
   * The phones enrolled in the last two days, newest first, as one operator sees them on the web console:
   * `announced` are those whose notice they haven't closed, `dismissed` those they have.
   */
  newPhones(userId: string): Promise<{ announced: OperatorPhone[]; dismissed: OperatorPhone[] }>;
  /** An operator closes the notice for these phones. It closes for them only, and for these phones only. */
  dismissNewPhones(userId: string, phoneIds: readonly string[]): Promise<void>;
  /** Where alerts stand on a phone. */
  alerts(session: OperatorDeviceRecord): PhoneAlertState;
  /**
   * Turns alerts on for these kinds at this push token, or off with no kinds. A push token belongs to one
   * phone: any other session that held it loses it, so a phone that signed in again is never told twice.
   */
  setAlerts(session: OperatorDeviceRecord, input: { kinds: OperatorAlertKind[]; pushToken: string | null; environment: "production" | "development" }): Promise<PhoneAlertState>;
  /** Whether any phone has alerts on, so the watcher knows there is someone to tell. */
  anyAlerts(): Promise<boolean>;
  /**
   * The phones to tell: those that chose `kind`, or with null every phone with alerts on. `except` leaves a
   * session out; `only` keeps to the sessions named.
   */
  alertTargets(kind: OperatorAlertKind | null, filter?: { except?: string; only?: readonly string[] }): Promise<AlertTarget[]>;
  /** Apple or Google said a phone's push token is dead: it is forgotten, and the phone shows as not reached. */
  dropPushToken(sessionId: string): Promise<void>;
  /** Notes that alerts reached these phones just now. */
  alerted(sessionIds: readonly string[]): Promise<void>;
  /**
   * The phones whose alerts end within a few days and haven't been told, and those whose alerts ended with
   * their session just now. Each is answered once.
   */
  alertEndings(): Promise<{ warn: Array<AlertTarget & { daysLeft: number }>; ended: AlertTarget[] }>;
  /** The phone signs itself out of the console. */
  end(session: OperatorDeviceRecord): Promise<boolean>;
  /** An operator revokes a phone from the web console. */
  revoke(id: string, by: AuditActor): Promise<boolean>;
  revokeAll(by: AuditActor): Promise<number>;
  /** Ends every operator session a person has, for example when they are suspended. */
  revokeUser(userId: string, detail: string): Promise<number>;
  /** Drops sign-ins nobody collected, nonces nobody signed, and sessions past their end that alerts no longer reach. */
  sweep(): Promise<void>;
}

const base64url = (bytes: Buffer) => bytes.toString("base64url");

/** Compares two strings in time that doesn't depend on where they differ. */
function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const actorOf = (record: OperatorDeviceRecord): AuditActor => ({ userId: record.userId, name: record.name, deviceId: record.id, deviceName: record.deviceName });

const endOf = (record: OperatorDeviceRecord) => Date.parse(record.createdAt) + ABSOLUTE_DAYS * DAY_MS;

export function toOperatorDeviceSession(record: OperatorDeviceRecord): OperatorDeviceSession {
  return {
    id: record.id,
    user_id: record.userId,
    user_name: record.name,
    name: record.deviceName,
    platform: record.platform,
    created_at: record.createdAt,
    last_used_at: record.lastUsedAt,
    last_unlocked_at: record.lastUnlockedAt,
    expires_at: new Date(endOf(record)).toISOString(),
  };
}

const alertState = (record: OperatorDeviceRecord): PhoneAlertState => ({
  state: !record.alerts ? "off" : record.alerts.pushSealed ? "on" : "not_reaching",
  kinds: record.alerts?.kinds ?? [],
  until: record.alerts ? new Date(endOf(record)).toISOString() : null,
  lastAlertAt: record.alerts?.lastAlertAt ?? null,
});

/**
 * Operator device sessions: what lets an operator's phone open the console. A separate record, token and
 * store from users' device sessions; neither can stand in for the other. Tokens, codes and nonces are stored
 * as an HMAC keyed with the session secret, so the store alone can't be used, and rotating SESSION_SECRET
 * ends every session. The token alone does nothing: reads need an unlock and every change needs its own
 * proof, both signatures by the key the phone enrolled, which it makes only after a face or fingerprint.
 */
export function operatorDeviceSessions(store: OperatorDeviceStore, secret: string, audit: AuditLog, now: () => number = Date.now): OperatorDeviceSessions {
  const hash = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");
  const used = (record: OperatorDeviceRecord) => Date.parse(record.lastUsedAt) + IDLE_DAYS * DAY_MS > now();
  const within = (record: OperatorDeviceRecord) => endOf(record) > now();
  /** Whether the token still opens the console. */
  const live = (record: OperatorDeviceRecord) => used(record) && within(record);
  /**
   * Whether the record stays. A phone whose console idled out is kept to its absolute end while alerts still
   * reach it: alerts would otherwise stop on exactly the instances where nothing is wrong and nobody looks.
   * Its token opens nothing; it is listed, and can be revoked.
   */
  const kept = (record: OperatorDeviceRecord) => within(record) && (used(record) || Boolean(record.alerts?.pushSealed));
  const reachable = (record: OperatorDeviceRecord) => within(record) && Boolean(record.alerts?.pushSealed);

  /** Unseals the push tokens of the records given. One that no longer unseals (the secret changed) is dropped. */
  const targetsOf = async (records: OperatorDeviceRecord[]): Promise<AlertTarget[]> => {
    const unreadable: string[] = [];
    const targets = records.flatMap((record): AlertTarget[] => {
      const pushToken = record.alerts?.pushSealed ? unseal<string>(record.alerts.pushSealed, secret) : null;
      if (typeof pushToken !== "string") {
        unreadable.push(record.id);
        return [];
      }
      return [{ sessionId: record.id, userId: record.userId, name: record.name, deviceName: record.deviceName, platform: record.platform, environment: record.alerts?.environment ?? "production", pushToken }];
    });
    await store.clearAlerts(unreadable);
    return targets;
  };

  /** A refused proof: written down, counted, and at the limit the session is revoked. */
  const refuse = async (session: OperatorDeviceRecord, operation: string, detail: string): Promise<void> => {
    await audit.write("refused", actorOf(session), { operation, detail });
    const failed = await store.failedProof(session.id);
    if (failed >= MAX_FAILED_PROOFS && (await store.remove({ ids: [session.id] })).length > 0) {
      await audit.write("revoked", actorOf(session), { detail: `${MAX_FAILED_PROOFS} refused proofs in a row` });
    }
  };

  /** Why a presented nonce and signature aren't good, or null when they are. */
  const check = async (session: OperatorDeviceRecord, nonce: string, signature: string, operation: string | null, hashOfInput: string | null): Promise<string | null> => {
    // The nonce leaves the store whatever happens next, so it can never be presented twice.
    const pending = await store.takeChallenge(session.id, hash(nonce));
    if (!pending) return "unknown or used nonce";
    if (pending.expiresAt <= now()) return "expired nonce";
    if (pending.operation !== operation || pending.inputHash !== hashOfInput) return "made for another operation or input";
    const message = operation === null || hashOfInput === null ? unlockMessage(nonce) : confirmMessage(nonce, operation, hashOfInput);
    return signed(session.publicKey, message, signature) ? null : "signature isn't this phone's";
  };

  /** Revokes sessions from the web console, and writes down who did it. */
  const revokeBy = async (gone: OperatorSessionsGone, by: AuditActor): Promise<number> => {
    const removed = await store.remove(gone);
    for (const record of removed) await audit.write("revoked", { ...by, deviceId: record.id, deviceName: record.deviceName }, { target: record.userId, detail: "revoked from the web console" });
    return removed.length;
  };

  const list = async (): Promise<OperatorPhone[]> =>
    (await store.sessions())
      .filter(kept)
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
      .map((record) => {
        const alerts = alertState(record);
        return { ...toOperatorDeviceSession(record), alerts: alerts.state, alerts_until: alerts.until, signed_out: !used(record) };
      });

  return {
    async issueCode({ identity, challenge, platform }) {
      if (identity.role !== "operator") return null;
      const code = base64url(randomBytes(32));
      await store.sweep(now());
      await store.putCode({ codeHash: hash(code), challenge, platform, userId: identity.userId, name: identity.name, email: identity.email, expiresAt: now() + CODE_SECONDS * 1000 });
      return code;
    },

    async redeemCode({ code, verifier, deviceName, platform, publicKey }) {
      const key = readPublicKey(publicKey);
      // A code is single use: it goes whether or not the exchange succeeds.
      const pending = await store.takeCode(hash(code));
      await store.sweep(now());
      if (!pending || pending.expiresAt <= now() || pending.platform !== platform || !key) return null;
      if (!same(base64url(createHash("sha256").update(verifier).digest()), pending.challenge)) return null;

      const token = `${OPERATOR_DEVICE_TOKEN_PREFIX}${base64url(randomBytes(32))}`;
      const stamp = new Date(now()).toISOString();
      const record: OperatorDeviceRecord = {
        id: `opd_${base64url(randomBytes(9))}`,
        tokenHash: hash(token),
        userId: pending.userId,
        name: pending.name,
        email: pending.email,
        deviceName: deviceName.trim().slice(0, 80) || (platform === "ios" ? "iPhone" : "Android phone"),
        platform,
        publicKey: key,
        createdAt: stamp,
        lastUsedAt: stamp,
        lastUnlockedAt: null,
        unlockedUntil: 0,
        failedProofs: 0,
        alerts: null,
      };
      const lapsed = (await store.sessions()).filter((entry) => !kept(entry)).map((entry) => entry.id);
      if (lapsed.length > 0) await store.remove({ ids: lapsed });
      await store.createSession(record);
      await audit.write("sign_in", actorOf(record));
      return { token, device: toOperatorDeviceSession(record) };
    },

    async find(token) {
      if (!token.startsWith(OPERATOR_DEVICE_TOKEN_PREFIX)) return null;
      const record = await store.findByTokenHash(hash(token));
      if (!record || !live(record)) return null;
      if (now() - Date.parse(record.lastUsedAt) < TOUCH_MS) return record;
      const lastUsedAt = new Date(now()).toISOString();
      await store.touch(record.id, lastUsedAt);
      return { ...record, lastUsedAt };
    },

    allow: async (sessionId) => (await store.countRequest(sessionId, Math.floor(now() / 60_000))) <= REQUESTS_PER_MINUTE,

    unlocked: (session) => session.unlockedUntil > now(),

    async challenge(session, change) {
      const nonce = base64url(randomBytes(32));
      const expiresAt = now() + CHALLENGE_SECONDS * 1000;
      await store.sweep(now());
      await store.putChallenge({ nonceHash: hash(nonce), sessionId: session.id, operation: change?.operation ?? null, inputHash: change?.inputHash ?? null, expiresAt }, MAX_PENDING_CHALLENGES);
      return { nonce, expires_at: new Date(expiresAt).toISOString() };
    },

    async unlock(session, nonce, signature) {
      const refusal = await check(session, nonce, signature, null, null);
      if (refusal) {
        await refuse(session, "unlock_operator_device_session", refusal);
        return null;
      }
      const unlockedUntil = now() + UNLOCK_SECONDS * 1000;
      if (!(await store.unlock(session.id, { until: unlockedUntil, at: new Date(now()).toISOString() }))) return null;
      await audit.write("unlock", actorOf(session));
      return { unlocked_until: new Date(unlockedUntil).toISOString() };
    },

    async prove(session, operation, input, proof) {
      const dot = proof.indexOf(".");
      const refusal = dot < 1 ? "malformed proof" : await check(session, proof.slice(0, dot), proof.slice(dot + 1), operation, inputHash(input));
      if (refusal) {
        await refuse(session, operation, refusal);
        return false;
      }
      return store.clearFailedProofs(session.id);
    },

    list,

    async newPhones(userId) {
      const since = now() - NEW_PHONE_HOURS * 3_600_000;
      const fresh = (await list()).filter((phone) => Date.parse(phone.created_at) > since).sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (fresh.length === 0) return { announced: [], dismissed: [] };
      const closed = new Set(await store.noticesDismissedBy(userId));
      return { announced: fresh.filter((phone) => !closed.has(phone.id)), dismissed: fresh.filter((phone) => closed.has(phone.id)) };
    },

    dismissNewPhones: (userId, phoneIds) => store.dismissNotice(userId, phoneIds, new Date(now()).toISOString()),

    alerts: alertState,

    async setAlerts(session, { kinds, pushToken, environment }) {
      const on = kinds.length > 0 && pushToken ? { kinds: [...kinds], pushSealed: seal(pushToken, secret), pushHash: hash(`push\n${pushToken}`), environment, setAt: new Date(now()).toISOString(), warnedAt: null } : null;
      return alertState((await store.setAlerts(session.id, on)) ?? { ...session, alerts: null });
    },

    anyAlerts: async () => (await store.sessions()).some(reachable),

    async alertTargets(kind, filter = {}) {
      return targetsOf((await store.sessions()).filter((record) => reachable(record) && (kind === null || record.alerts?.kinds.includes(kind)) && record.id !== filter.except && (!filter.only || filter.only.includes(record.id))));
    },

    dropPushToken: (sessionId) => store.dropPushToken(sessionId),

    alerted: (sessionIds) => store.alerted(sessionIds, new Date(now()).toISOString()),

    async alertEndings() {
      const warning = ALERTS_WARNING_DAYS * DAY_MS;
      const holding = (await store.sessions()).filter((record) => record.alerts?.pushSealed);
      const ended = holding.filter((record) => !within(record));
      // A phone that turned alerts on inside the last few days saw the date on its Alerts page, and isn't told again.
      const warn = holding.filter((record) => within(record) && endOf(record) - now() <= warning && !record.alerts?.warnedAt && Date.parse(record.alerts?.setAt ?? "") < endOf(record) - warning);
      if (ended.length === 0 && warn.length === 0) return { warn: [], ended: [] };
      const answer = {
        warn: (await targetsOf(warn)).map((target) => ({ ...target, daysLeft: Math.max(1, Math.ceil((endOf(warn.find((record) => record.id === target.sessionId) as OperatorDeviceRecord) - now()) / DAY_MS)) })),
        ended: await targetsOf(ended),
      };
      await store.clearAlerts(ended.map((record) => record.id));
      await store.warned(warn.map((record) => record.id), new Date(now()).toISOString());
      return answer;
    },

    async end(session) {
      const gone = (await store.remove({ ids: [session.id] })).length > 0;
      if (gone) await audit.write("sign_out", actorOf(session));
      return gone;
    },

    revoke: async (id, by) => (await revokeBy({ ids: [id] }, by)) > 0,

    revokeAll: (by) => revokeBy("all", by),

    async revokeUser(userId, detail) {
      const gone = await store.remove({ userId });
      for (const record of gone) await audit.write("revoked", actorOf(record), { detail });
      return gone.length;
    },

    async sweep() {
      await store.sweep(now());
      // A phone whose alerts are still to be told they ended is left for `alertEndings` to answer first.
      const lapsed = (await store.sessions()).filter((entry) => !kept(entry) && !entry.alerts?.pushSealed).map((entry) => entry.id);
      if (lapsed.length > 0) await store.remove({ ids: lapsed });
    },
  };
}

import "server-only";

import type { OperatorAuditEntry } from "@livepeer/api-client";
import { and, count, desc, eq, gte, inArray, like, lte, ne, schema, sql, type Database } from "@livepeer/db";

import { identitySeal } from "../data/identity";
import type { AuditStore, OperatorDeviceRecord, OperatorDeviceStore, PendingOperatorCode } from "./store";

const { operatorDeviceSessions: sessions, operatorSignInCodes: codes, operatorChallenges: challenges, operatorPushTokens: pushTokens, operatorAudit: audit } = schema;

/** Postgres's code for a row that points at a row that isn't there. */
const FOREIGN_KEY_VIOLATION = "23503";

const codeOf = (error: unknown): string | undefined => (error as { code?: string; cause?: { code?: string } } | null)?.code ?? (error as { cause?: { code?: string } } | null)?.cause?.code;

/**
 * Operator device sessions in Postgres. A session's nonces and its alerts are rows that point at it and go
 * when it goes, so "they end with the session, however it ends" is the database's rule, not the code's.
 * A nonce or a sign-in is taken with one `DELETE … RETURNING`, so two requests can never both use it.
 */
export function postgresOperatorDeviceStore(db: Database, secret: string): OperatorDeviceStore {
  const identity = identitySeal(secret);

  const record = (row: typeof sessions.$inferSelect, alerts: typeof pushTokens.$inferSelect | null): OperatorDeviceRecord => ({
    id: row.id,
    tokenHash: row.tokenHash,
    userId: row.userId,
    ...identity.open(row.identitySealed, row.userId),
    deviceName: row.deviceName,
    platform: row.platform,
    publicKey: row.publicKey,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
    lastUnlockedAt: row.lastUnlockedAt?.toISOString() ?? null,
    unlockedUntil: row.unlockedUntil?.getTime() ?? 0,
    failedProofs: row.failedProofs,
    alerts: alerts && {
      kinds: alerts.kinds as NonNullable<OperatorDeviceRecord["alerts"]>["kinds"],
      pushSealed: alerts.pushSealed,
      pushHash: alerts.pushHash,
      environment: alerts.environment,
      setAt: alerts.setAt.toISOString(),
      lastAlertAt: alerts.lastAlertAt?.toISOString() ?? null,
      warnedAt: alerts.warnedAt?.toISOString() ?? null,
    },
  });

  /** Sessions with their alerts beside them. */
  const withAlerts = (from: Pick<Database, "select"> = db) => from.select({ session: sessions, alerts: pushTokens }).from(sessions).leftJoin(pushTokens, eq(pushTokens.sessionId, sessions.id));

  const pending = (row: typeof codes.$inferSelect): PendingOperatorCode => ({
    codeHash: row.codeHash,
    challenge: row.challenge,
    platform: row.platform,
    userId: row.userId,
    ...identity.open(row.identitySealed, row.userId),
    expiresAt: row.expiresAt.getTime(),
  });

  return {
    async putCode(code) {
      await db.insert(codes).values({ codeHash: code.codeHash, challenge: code.challenge, platform: code.platform, userId: code.userId, identitySealed: identity.seal(code), expiresAt: new Date(code.expiresAt) });
    },
    async takeCode(codeHash) {
      const [row] = await db.delete(codes).where(eq(codes.codeHash, codeHash)).returning();
      return row ? pending(row) : null;
    },
    async createSession(session) {
      await db.insert(sessions).values({
        id: session.id,
        tokenHash: session.tokenHash,
        userId: session.userId,
        identitySealed: identity.seal(session),
        deviceName: session.deviceName,
        platform: session.platform,
        publicKey: session.publicKey,
        createdAt: new Date(session.createdAt),
        lastUsedAt: new Date(session.lastUsedAt),
        lastUnlockedAt: session.lastUnlockedAt ? new Date(session.lastUnlockedAt) : null,
        unlockedUntil: session.unlockedUntil > 0 ? new Date(session.unlockedUntil) : null,
        failedProofs: session.failedProofs,
      });
    },
    async findByTokenHash(tokenHash) {
      const [row] = await withAlerts().where(eq(sessions.tokenHash, tokenHash)).limit(1);
      return row ? record(row.session, row.alerts) : null;
    },
    async sessions() {
      return (await withAlerts()).map((row) => record(row.session, row.alerts));
    },
    async touch(id, at) {
      await db.update(sessions).set({ lastUsedAt: new Date(at) }).where(eq(sessions.id, id));
    },
    async unlock(id, { until, at }) {
      return (await db.update(sessions).set({ unlockedUntil: new Date(until), lastUnlockedAt: new Date(at), failedProofs: 0 }).where(eq(sessions.id, id)).returning({ id: sessions.id })).length > 0;
    },
    async failedProof(id) {
      const [row] = await db.update(sessions).set({ failedProofs: sql`${sessions.failedProofs} + 1` }).where(eq(sessions.id, id)).returning({ failed: sessions.failedProofs });
      return row?.failed ?? 0;
    },
    async clearFailedProofs(id) {
      return (await db.update(sessions).set({ failedProofs: 0 }).where(eq(sessions.id, id)).returning({ id: sessions.id })).length > 0;
    },
    async countRequest(id, minute) {
      // One statement, so requests arriving together are each counted.
      const [row] = await db
        .update(sessions)
        .set({ windowCount: sql`case when ${sessions.windowStart} = ${minute} then ${sessions.windowCount} + 1 else 1 end`, windowStart: minute })
        .where(eq(sessions.id, id))
        .returning({ count: sessions.windowCount });
      return row?.count ?? 0;
    },
    async remove(gone) {
      const which = gone === "all" ? undefined : "ids" in gone ? inArray(sessions.id, [...gone.ids]) : eq(sessions.userId, gone.userId);
      if (gone !== "all" && "ids" in gone && gone.ids.length === 0) return [];
      return (await db.delete(sessions).where(which).returning()).map((row) => record(row, null));
    },
    async putChallenge(challenge, keep) {
      try {
        await db.transaction(async (tx) => {
          const older = await tx.select({ nonceHash: challenges.nonceHash }).from(challenges).where(eq(challenges.sessionId, challenge.sessionId)).orderBy(desc(challenges.expiresAt)).offset(keep - 1);
          if (older.length > 0) await tx.delete(challenges).where(inArray(challenges.nonceHash, older.map((row) => row.nonceHash)));
          await tx.insert(challenges).values({ nonceHash: challenge.nonceHash, sessionId: challenge.sessionId, operation: challenge.operation, inputHash: challenge.inputHash, expiresAt: new Date(challenge.expiresAt) });
        });
      } catch (error) {
        // The session was revoked between the request being let in and now. Its nonce would open nothing.
        if (codeOf(error) !== FOREIGN_KEY_VIOLATION) throw error;
      }
    },
    async takeChallenge(sessionId, nonceHash) {
      const [row] = await db.delete(challenges).where(and(eq(challenges.sessionId, sessionId), eq(challenges.nonceHash, nonceHash))).returning();
      return row ? { nonceHash: row.nonceHash, sessionId: row.sessionId, operation: row.operation, inputHash: row.inputHash, expiresAt: row.expiresAt.getTime() } : null;
    },
    async setAlerts(id, alerts) {
      return db.transaction(async (tx) => {
        const [session] = await tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, id)).for("update");
        if (!session) return null;
        if (!alerts) {
          await tx.delete(pushTokens).where(eq(pushTokens.sessionId, id));
        } else {
          await tx.delete(pushTokens).where(and(eq(pushTokens.pushHash, alerts.pushHash), ne(pushTokens.sessionId, id)));
          const values = { kinds: alerts.kinds, pushSealed: alerts.pushSealed, pushHash: alerts.pushHash, environment: alerts.environment, setAt: new Date(alerts.setAt), warnedAt: alerts.warnedAt ? new Date(alerts.warnedAt) : null };
          // When the phone last heard an alert is left as it was.
          await tx.insert(pushTokens).values({ sessionId: id, ...values }).onConflictDoUpdate({ target: pushTokens.sessionId, set: values });
        }
        const [row] = await withAlerts(tx).where(eq(sessions.id, id));
        return row ? record(row.session, row.alerts) : null;
      });
    },
    async dropPushToken(id) {
      await db.update(pushTokens).set({ pushSealed: null }).where(eq(pushTokens.sessionId, id));
    },
    async clearAlerts(ids) {
      if (ids.length > 0) await db.delete(pushTokens).where(inArray(pushTokens.sessionId, [...ids]));
    },
    async alerted(ids, at) {
      if (ids.length > 0) await db.update(pushTokens).set({ lastAlertAt: new Date(at) }).where(inArray(pushTokens.sessionId, [...ids]));
    },
    async warned(ids, at) {
      if (ids.length > 0) await db.update(pushTokens).set({ warnedAt: new Date(at) }).where(inArray(pushTokens.sessionId, [...ids]));
    },
    async sweep(now) {
      await db.delete(codes).where(lte(codes.expiresAt, new Date(now)));
      await db.delete(challenges).where(lte(challenges.expiresAt, new Date(now)));
    },
  };
}

/** The audit log in Postgres. The operator's name is sealed like every other name; the rest is ids and what happened. */
export function postgresAuditStore(db: Database, secret: string): AuditStore {
  const identity = identitySeal(secret);
  return {
    async append(entry, keep) {
      await db.insert(audit).values({
        id: entry.id,
        at: new Date(entry.at),
        event: entry.event,
        userId: entry.user_id,
        actorSealed: identity.seal({ name: entry.user_name, email: null }),
        deviceId: entry.device_id,
        deviceName: entry.device_name,
        operation: entry.operation,
        target: entry.target,
        detail: entry.detail,
      });
      await db.delete(audit).where(sql`${audit.seq} <= (select ${audit.seq} from ${audit} order by ${audit.seq} desc offset ${keep} limit 1)`);
    },
    async newest(limit) {
      const rows = await db.select().from(audit).orderBy(desc(audit.seq)).limit(limit);
      return rows.map(
        (row): OperatorAuditEntry => ({
          id: row.id,
          at: row.at.toISOString(),
          event: row.event,
          user_id: row.userId,
          user_name: identity.open(row.actorSealed, row.userId).name,
          device_id: row.deviceId,
          device_name: row.deviceName,
          operation: row.operation,
          target: row.target,
          detail: row.detail,
        }),
      );
    },
    async countSince({ event, deviceId, detailStartsWith, since }) {
      const [row] = await db
        .select({ total: count() })
        .from(audit)
        .where(and(eq(audit.event, event), eq(audit.deviceId, deviceId), gte(audit.at, new Date(since)), like(audit.detail, `${detailStartsWith.replace(/[\\%_]/g, "\\$&")}%`)));
      return row?.total ?? 0;
    },
  };
}

import "server-only";

import { and, eq, lte, schema, type Database } from "@livepeer/db";

import { identitySeal } from "../data/identity";
import type { DeviceRecord, DeviceSessionStore, PendingCode } from "./store";

const { deviceSessions: sessions, deviceSignInCodes: codes } = schema;

/**
 * Device sessions in Postgres: a row per session and per pending sign-in. A token is found by one indexed
 * read, and a sign-in is collected by one `DELETE … RETURNING`, so two requests can never both collect it.
 */
export function postgresDeviceSessionStore(db: Database, secret: string): DeviceSessionStore {
  const identity = identitySeal(secret);

  const record = (row: typeof sessions.$inferSelect): DeviceRecord => ({
    id: row.id,
    tokenHash: row.tokenHash,
    userId: row.userId,
    ...identity.open(row.identitySealed, row.userId),
    role: row.role,
    deviceName: row.deviceName,
    platform: row.platform,
    builderKey: row.builderKeySealed,
    workspaceId: row.workspaceId,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
  });

  const pending = (row: typeof codes.$inferSelect): PendingCode => ({
    codeHash: row.codeHash,
    challenge: row.challenge,
    platform: row.platform,
    userId: row.userId,
    ...identity.open(row.identitySealed, row.userId),
    role: row.role,
    builderKey: row.builderKeySealed,
    expiresAt: row.expiresAt.getTime(),
  });

  return {
    async putCode(code) {
      await db.insert(codes).values({
        codeHash: code.codeHash,
        challenge: code.challenge,
        platform: code.platform,
        userId: code.userId,
        role: code.role ?? "user",
        builderKeySealed: code.builderKey,
        identitySealed: identity.seal(code),
        expiresAt: new Date(code.expiresAt),
      });
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
        role: session.role ?? "user",
        deviceName: session.deviceName,
        platform: session.platform,
        builderKeySealed: session.builderKey,
        identitySealed: identity.seal(session),
        workspaceId: session.workspaceId ?? null,
        createdAt: new Date(session.createdAt),
        lastUsedAt: new Date(session.lastUsedAt),
      });
    },
    async findByTokenHash(tokenHash) {
      const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
      return row ? record(row) : null;
    },
    async touch(id, at) {
      await db.update(sessions).set({ lastUsedAt: new Date(at) }).where(eq(sessions.id, id));
    },
    async listForUser(userId) {
      return (await db.select().from(sessions).where(eq(sessions.userId, userId))).map(record);
    },
    async setWorkspace(id, workspaceId) {
      return (await db.update(sessions).set({ workspaceId }).where(eq(sessions.id, id)).returning({ id: sessions.id })).length > 0;
    },
    async remove(by) {
      const mine = eq(sessions.userId, by.userId);
      return (await db.delete(sessions).where("id" in by ? and(mine, eq(sessions.id, by.id)) : mine).returning({ id: sessions.id })).length;
    },
    async sweep({ now, idleSince }) {
      await db.delete(codes).where(lte(codes.expiresAt, new Date(now)));
      await db.delete(sessions).where(lte(sessions.lastUsedAt, new Date(idleSince)));
    },
  };
}

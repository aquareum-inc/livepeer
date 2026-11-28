import "server-only";

import type { UploadRecord, UploadRecords } from "@livepeer/api-client";
import { and, asc, desc, eq, isNull, lt, schema, type Database } from "@livepeer/db";

const { mediaFiles: files } = schema;

const record = (row: typeof files.$inferSelect): UploadRecord => ({
  id: row.id,
  media_id: row.mediaId,
  user_id: row.userId,
  workspace_id: row.workspaceId,
  kind: row.kind,
  content_type: row.contentType,
  size_bytes: row.sizeBytes,
  title: row.title,
  aspect: row.aspect,
  object_key: row.objectKey,
  state: row.state,
  created_at: row.createdAt.toISOString(),
  expires_at: row.expiresAt.toISOString(),
});

/** Upload tickets and the files they became, in Postgres: a ticket asked of one server is good on the next. */
export function postgresUploadRecords(db: Database): UploadRecords {
  return {
    async insert(entry) {
      await db.insert(files).values({ id: entry.id, mediaId: entry.media_id, userId: entry.user_id, workspaceId: entry.workspace_id, kind: entry.kind, contentType: entry.content_type, sizeBytes: entry.size_bytes, title: entry.title, aspect: entry.aspect, objectKey: entry.object_key, state: entry.state, createdAt: new Date(entry.created_at), expiresAt: new Date(entry.expires_at) });
    },
    async find(id) {
      const [row] = await db.select().from(files).where(eq(files.id, id));
      return row ? record(row) : null;
    },
    async findStoredMedia(mediaId) {
      const [row] = await db.select().from(files).where(and(eq(files.mediaId, mediaId), eq(files.state, "stored")));
      return row ? record(row) : null;
    },
    async markStored(id) {
      await db.update(files).set({ state: "stored" }).where(eq(files.id, id));
      return this.find(id);
    },
    async listStored(account) {
      const whose = account.workspaceId ? eq(files.workspaceId, account.workspaceId) : and(isNull(files.workspaceId), eq(files.userId, account.userId));
      return (await db.select().from(files).where(and(eq(files.state, "stored"), whose)).orderBy(desc(files.createdAt))).map(record);
    },
    async abandoned(now, limit) {
      return (await db.select().from(files).where(and(eq(files.state, "pending"), lt(files.expiresAt, now))).orderBy(asc(files.expiresAt)).limit(limit)).map(record);
    },
    async delete(id) {
      await db.delete(files).where(eq(files.id, id));
    },
  };
}

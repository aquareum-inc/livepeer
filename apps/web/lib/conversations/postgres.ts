import "server-only";

import { and, desc, eq, isNull, schema, type Database } from "@livepeer/db";
import type { ConversationStore, StoredConversation, StoredMessage } from "@livepeer/api-client/conversation-store";

const { conversations, conversationMessages } = schema;

/** Conversation store backed by the instance's Postgres database. */
export function postgresConversationStore(db: Database): ConversationStore {
  const toConversation = (row: typeof conversations.$inferSelect): StoredConversation => ({
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    title: row.title,
    agentModel: row.agentModel,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

  const toMessage = (row: typeof conversationMessages.$inferSelect): StoredMessage => ({
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    agentModel: row.agentModel,
    jobId: row.jobId,
    usage: row.usage as StoredMessage["usage"],
    createdAt: row.createdAt.toISOString(),
  });

  const ownerFilter = (
    userId: string,
    workspaceId: string | null,
  ) =>
    workspaceId
      ? and(eq(conversations.userId, userId), eq(conversations.workspaceId, workspaceId))
      : and(eq(conversations.userId, userId), isNull(conversations.workspaceId));

  return {
    async create(record) {
      await db.insert(conversations).values({
        id: record.id,
        userId: record.userId,
        workspaceId: record.workspaceId,
        title: record.title,
        agentModel: record.agentModel,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      });
    },

    async get(id, userId, workspaceId) {
      const [row] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, id), ownerFilter(userId, workspaceId)))
        .limit(1);
      return row ? toConversation(row) : null;
    },

    async list(userId, workspaceId) {
      const rows = await db
        .select()
        .from(conversations)
        .where(ownerFilter(userId, workspaceId))
        .orderBy(desc(conversations.updatedAt))
        .limit(100);
      return rows.map(toConversation);
    },

    async delete(id, userId, workspaceId) {
      const deleted = await db
        .delete(conversations)
        .where(and(eq(conversations.id, id), ownerFilter(userId, workspaceId)))
        .returning({ id: conversations.id });
      return deleted.length > 0;
    },

    async touch(id, updatedAt, title) {
      await db
        .update(conversations)
        .set({ updatedAt: new Date(updatedAt), ...(title !== undefined ? { title } : {}) })
        .where(eq(conversations.id, id));
    },

    async addMessage(message) {
      await db.insert(conversationMessages).values({
        id: message.id,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        agentModel: message.agentModel,
        jobId: message.jobId,
        usage: message.usage,
        createdAt: new Date(message.createdAt),
      });
    },

    async listMessages(conversationId) {
      const rows = await db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversationId))
        .orderBy(conversationMessages.createdAt);
      return rows.map(toMessage);
    },
  };
}

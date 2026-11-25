/**
 * What the conversation store keeps for one conversation. Fields map to the DB columns; the api-client
 * transforms them to the richer types the UI expects (`Conversation`, `ConversationSummary`).
 */
export interface StoredConversation {
  id: string;
  userId: string;
  workspaceId: string | null;
  title: string;
  agentModel: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One message in a persisted conversation. */
export interface StoredMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  agentModel: string | null;
  jobId: string | null;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  createdAt: string;
}

/**
 * The store that keeps conversations and messages across restarts. Provided to `createApiClient` by the
 * host: the app wires it over Postgres through `@livepeer/db`; tests can supply an in-memory one.
 */
export interface ConversationStore {
  create(record: StoredConversation): Promise<void>;
  get(
    id: string,
    userId: string,
    workspaceId: string | null,
  ): Promise<StoredConversation | null>;
  list(
    userId: string,
    workspaceId: string | null,
  ): Promise<StoredConversation[]>;
  delete(
    id: string,
    userId: string,
    workspaceId: string | null,
  ): Promise<boolean>;
  touch(
    id: string,
    updatedAt: string,
    title?: string,
  ): Promise<void>;
  addMessage(message: StoredMessage): Promise<void>;
  listMessages(conversationId: string): Promise<StoredMessage[]>;
}

import "server-only";

import { storeOver } from "../data/database";
import { postgresConversationStore } from "./postgres";

const store = storeOver((db) => postgresConversationStore(db));

/** The instance's conversation store, over the database open right now. */
export function conversationStore() {
  return store();
}

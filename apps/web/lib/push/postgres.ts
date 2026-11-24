import "server-only";

import { schema, sql, type Database } from "@livepeer/db";

import type { OutboxStore } from "./recording";

const { pushOutbox } = schema;

/** The recording sender's outbox in Postgres, for a mock-only instance on a host with no disk. */
export function postgresOutboxStore(db: Database): OutboxStore {
  return {
    async record(push, keep) {
      await db.insert(pushOutbox).values({ at: new Date(push.at), platform: push.platform, environment: push.environment, payload: push.payload });
      await db.delete(pushOutbox).where(sql`${pushOutbox.seq} <= (select ${pushOutbox.seq} from ${pushOutbox} order by ${pushOutbox.seq} desc offset ${keep} limit 1)`);
    },
  };
}

import "server-only";

import { randomBytes } from "node:crypto";

import type { OperatorAuditEntry } from "@livepeer/api-client";

import type { AuditStore } from "./store";

/** The log keeps this many entries, newest last; older ones are dropped. */
export const AUDIT_LIMIT = 2000;

/** Who did it and on which phone. A revocation from the web console has no phone. */
export interface AuditActor {
  userId: string;
  name: string;
  deviceId: string | null;
  deviceName: string | null;
}

export interface AuditLog {
  write(event: OperatorAuditEntry["event"], actor: AuditActor, facts?: { operation?: string | null; target?: string | null; detail?: string | null }): Promise<void>;
  /** Newest first. */
  list(limit: number): Promise<OperatorAuditEntry[]>;
}

/**
 * The record of what operators' phones did and were refused: every sign-in, unlock, change, refusal and
 * revocation. It holds names and ids only, never a token, a key or a request body.
 */
export function auditLog(store: AuditStore, now: () => number = Date.now): AuditLog {
  return {
    write(event, actor, facts = {}) {
      return store.append(
        {
          id: `aud_${randomBytes(9).toString("base64url")}`,
          at: new Date(now()).toISOString(),
          event,
          user_id: actor.userId,
          user_name: actor.name,
          device_id: actor.deviceId,
          device_name: actor.deviceName,
          operation: facts.operation ?? null,
          target: facts.target ?? null,
          detail: facts.detail ?? null,
        },
        AUDIT_LIMIT,
      );
    },
    list: (limit) => store.newest(Math.max(1, Math.min(limit, AUDIT_LIMIT))),
  };
}

import "server-only";

import type { StateStore } from "../data/store";
import { apnsPayload } from "./apns";
import { fcmMessage } from "./fcm";
import type { PushSender, PushTarget } from "./types";

/** The outbox keeps this many notifications, newest last. */
export const OUTBOX_LIMIT = 50;

/** What would have been sent, exactly as Apple or Google would have been handed it, less the push token. */
export interface RecordedPush {
  at: string;
  platform: PushTarget["platform"];
  environment: PushTarget["environment"];
  /** The APNs payload (usable with `xcrun simctl push`), or the Firebase message with the push token left out. */
  payload: Record<string, unknown>;
}

export interface OutboxContents {
  sent: RecordedPush[];
}

/** Where the recording sender writes down what it would have sent. */
export interface OutboxStore {
  /** Adds a notification, and keeps only the newest `keep`. */
  record(push: RecordedPush, keep: number): Promise<void>;
}

/** The outbox kept as one document: a JSON file, or memory in tests. */
export function documentOutboxStore(document: StateStore<OutboxContents>): OutboxStore {
  return {
    async record(push, keep) {
      document.update((contents) => {
        contents.sent = [...contents.sent, push].slice(-keep);
      });
    },
  };
}

/**
 * The sender for mock-only mode, tests and CI: it contacts nobody and writes down what it would have sent.
 * It offers both platforms, so the screens and the rules can be exercised with no credentials.
 */
export function recordingSender(store: OutboxStore, now: () => number = Date.now): PushSender {
  return {
    offers: () => true,
    async send(target, notification) {
      const payload = target.platform === "ios" ? apnsPayload(notification) : fcmMessage("<push token>", notification);
      await store.record({ at: new Date(now()).toISOString(), platform: target.platform, environment: target.environment, payload }, OUTBOX_LIMIT);
      return { outcome: "sent", detail: null };
    },
  };
}

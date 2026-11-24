import "server-only";

import { mockMode } from "../auth/session";
import { jsonFileStore } from "../data/json-file";
import { env } from "../env";
import { instance } from "../instance";
import { apnsSender } from "./apns";
import { readApnsCredentials, readFcmCredentials } from "./credentials";
import { fcmSender } from "./fcm";
import { documentOutboxStore, recordingSender, type OutboxContents } from "./recording";
import type { PushPlatform, PushSender } from "./types";

/** Where a platform stands: able to send, not set up (which is fine: alerts are optional), or set up wrongly. */
export type PushSetup = { state: "ready"; detail: string } | { state: "none"; detail: string } | { state: "problem"; detail: string };

export const fileOutbox = () => documentOutboxStore(jsonFileStore<OutboxContents>("push-outbox.json", (value) => ({ sent: value.sent ?? [] })));

/**
 * Whether the instance can send to each platform, in words safe to show an operator. iPhone needs the APNs key
 * and an app named in the config; Android needs the service account and the project's public values in the
 * config, for the same project.
 */
export function pushSetup(): Record<PushPlatform, PushSetup> {
  if (mockMode()) {
    const recorded: PushSetup = { state: "ready", detail: "recorded, not sent (mock-only mode)" };
    return { ios: recorded, android: recorded };
  }
  const apps = instance().mobile;
  const apns = readApnsCredentials(env);
  const fcm = readFcmCredentials(env);
  const firebase = apps?.android?.firebase;
  return {
    ios: !apns
      ? { state: "none", detail: "no APNs key" }
      : !apns.ok
        ? { state: "problem", detail: apns.problem }
        : !apps?.ios?.bundleId
          ? { state: "problem", detail: "an APNs key is set but mobile.ios.bundleId is not" }
          : { state: "ready", detail: `key ${apns.value.keyId} for ${apps.ios.bundleId}` },
    android: !fcm
      ? { state: "none", detail: "no Firebase service account" }
      : !fcm.ok
        ? { state: "problem", detail: fcm.problem }
        : !firebase
          ? { state: "problem", detail: "a service account is set but mobile.android.firebase is not" }
          : firebase.projectId !== fcm.value.projectId
            ? { state: "problem", detail: `the service account is for ${fcm.value.projectId}, the config names ${firebase.projectId}` }
            : { state: "ready", detail: `project ${firebase.projectId}` },
  };
}

let built: { key: string; sender: PushSender } | null = null;

/**
 * What sends the instance's notifications. In mock-only mode it only records. Otherwise it sends straight to
 * Apple and Google with the publisher's own credentials, for whichever platforms are set up. One per process,
 * rebuilt when the credentials or the named apps change.
 */
export function pushSender(): PushSender {
  const apps = instance().mobile;
  const key = JSON.stringify([mockMode(), env("APNS_KEY"), env("APNS_KEY_ID"), env("APNS_TEAM_ID"), env("FCM_SERVICE_ACCOUNT"), apps?.ios?.bundleId, apps?.android?.firebase?.projectId]);
  if (built?.key === key) return built.sender;

  let sender: PushSender;
  if (mockMode()) {
    sender = recordingSender(fileOutbox());
  } else {
    const setup = pushSetup();
    const apns = readApnsCredentials(env);
    const fcm = readFcmCredentials(env);
    const senders: Partial<Record<PushPlatform, PushSender>> = {
      ...(setup.ios.state === "ready" && apns?.ok && apps?.ios ? { ios: apnsSender({ credentials: apns.value, topic: apps.ios.bundleId }) } : {}),
      ...(setup.android.state === "ready" && fcm?.ok ? { android: fcmSender({ credentials: fcm.value }) } : {}),
    };
    sender = {
      offers: (platform) => senders[platform] !== undefined,
      send: (target, notification) => senders[target.platform]?.send(target, notification) ?? Promise.resolve({ outcome: "failed", detail: "not set up" }),
    };
  }
  built = { key, sender };
  return sender;
}

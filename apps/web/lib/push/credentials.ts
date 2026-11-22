import "server-only";

import { createPrivateKey, type KeyObject } from "node:crypto";

/** What the instance signs its requests to Apple's push service with. */
export interface ApnsCredentials {
  key: KeyObject;
  keyId: string;
  teamId: string;
}

/** The Firebase service account that may send messages for the project. */
export interface FcmCredentials {
  key: KeyObject;
  clientEmail: string;
  projectId: string;
}

/** Credentials that parsed, or why they didn't, in words that are safe to show. `null` means none were given. */
export type Read<T> = { ok: true; value: T } | { ok: false; problem: string } | null;

type Env = (name: string) => string | undefined;

/** The value of a variable that holds a whole file as base64 on one line. Null when it isn't base64 of text. */
function file(value: string): string | null {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) return null;
  const text = Buffer.from(value, "base64").toString("utf8");
  return text.includes("�") || text.trim() === "" ? null : text;
}

/** APNS_KEY (the .p8 file, base64 on one line), APNS_KEY_ID and APNS_TEAM_ID. */
export function readApnsCredentials(env: Env): Read<ApnsCredentials> {
  const [encoded, keyId, teamId] = [env("APNS_KEY"), env("APNS_KEY_ID"), env("APNS_TEAM_ID")];
  if (!encoded && !keyId && !teamId) return null;
  if (!encoded || !keyId || !teamId) return { ok: false, problem: `${[!encoded && "APNS_KEY", !keyId && "APNS_KEY_ID", !teamId && "APNS_TEAM_ID"].filter(Boolean).join(" and ")} missing` };
  if (!/^[A-Z0-9]{10}$/.test(keyId)) return { ok: false, problem: "APNS_KEY_ID isn't a 10-character key id" };
  if (!/^[A-Z0-9]{10}$/.test(teamId)) return { ok: false, problem: "APNS_TEAM_ID isn't a 10-character team id" };
  const pem = file(encoded);
  if (!pem) return { ok: false, problem: "APNS_KEY isn't the .p8 file as base64" };
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") return { ok: false, problem: "APNS_KEY isn't an APNs authentication key (P-256)" };
    return { ok: true, value: { key, keyId, teamId } };
  } catch {
    return { ok: false, problem: "APNS_KEY isn't a private key" };
  }
}

/** FCM_SERVICE_ACCOUNT: the service account's JSON file, base64 on one line. */
export function readFcmCredentials(env: Env): Read<FcmCredentials> {
  const encoded = env("FCM_SERVICE_ACCOUNT");
  if (!encoded) return null;
  const text = file(encoded);
  if (!text) return { ok: false, problem: "FCM_SERVICE_ACCOUNT isn't the service account's JSON file as base64" };
  let account: { type?: unknown; project_id?: unknown; client_email?: unknown; private_key?: unknown };
  try {
    account = JSON.parse(text) as typeof account;
  } catch {
    return { ok: false, problem: "FCM_SERVICE_ACCOUNT isn't JSON" };
  }
  if (account.type !== "service_account" || typeof account.project_id !== "string" || typeof account.client_email !== "string" || typeof account.private_key !== "string") {
    return { ok: false, problem: "FCM_SERVICE_ACCOUNT isn't a service account file" };
  }
  try {
    const key = createPrivateKey(account.private_key);
    if (key.asymmetricKeyType !== "rsa") return { ok: false, problem: "FCM_SERVICE_ACCOUNT's key isn't an RSA key" };
    return { ok: true, value: { key, clientEmail: account.client_email, projectId: account.project_id } };
  } catch {
    return { ok: false, problem: "FCM_SERVICE_ACCOUNT's key isn't a private key" };
  }
}

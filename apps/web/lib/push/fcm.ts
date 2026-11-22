import "server-only";

import { sign } from "node:crypto";

import type { FcmCredentials } from "./credentials";
import { withRetries, type Attempt } from "./retry";
import type { PushNotification, PushSender } from "./types";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const REQUEST_MS = 10_000;

export interface FcmOptions {
  credentials: FcmCredentials;
  fetch?: typeof fetch;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}

/** What Firebase is handed for an Android phone: the words, the channel, and where in the console to go. Nothing else. */
export function fcmMessage(pushToken: string, notification: PushNotification): Record<string, unknown> {
  return {
    message: {
      token: pushToken,
      notification: { title: notification.title, body: notification.body },
      data: { kind: notification.kind, opens: notification.opens },
      android: { ttl: `${notification.lifeSeconds}s`, priority: notification.urgent ? "HIGH" : "NORMAL", notification: { channel_id: notification.channel, tag: notification.collapse } },
    },
  };
}

const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** Firebase's own error word for a refused message, when its answer carries one. */
function errorCode(body: unknown): string | null {
  const error = (body as { error?: { status?: unknown; details?: Array<{ errorCode?: unknown }> } } | null)?.error;
  const specific = error?.details?.find((detail) => typeof detail.errorCode === "string")?.errorCode;
  const code = typeof specific === "string" ? specific : typeof error?.status === "string" ? error.status : null;
  return code ? code.slice(0, 60) : null;
}

/** Sends through Firebase Cloud Messaging's HTTP v1 API as the project's service account. No dependency: fetch and node:crypto. */
export function fcmSender({ credentials, fetch: request = fetch, now = Date.now, wait }: FcmOptions): PushSender {
  let access: { value: string; until: number } | null = null;

  /** An access token for sending messages and nothing else. "refused" when Google won't give the service account one. */
  const authorise = async (): Promise<string | "refused" | "again"> => {
    if (access && access.until > now()) return access.value;
    const issued = Math.floor(now() / 1000);
    const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iss: credentials.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: issued, exp: issued + 3600 })}`;
    const assertion = `${unsigned}.${sign("sha256", Buffer.from(unsigned), credentials.key).toString("base64url")}`;
    const response = await request(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      signal: AbortSignal.timeout(REQUEST_MS),
    });
    if (response.status >= 500 || response.status === 429) return "again";
    if (!response.ok) return "refused";
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string") return "refused";
    access = { value: body.access_token, until: now() + (Math.max(Number(body.expires_in) || 0, 120) - 60) * 1000 };
    return access.value;
  };

  return {
    offers: (platform) => platform === "android",
    send(target, notification) {
      let renewed = false;
      return withRetries(async (): Promise<Attempt> => {
        const bearer = await authorise();
        if (bearer === "again") return { outcome: "again", detail: "authorisation unavailable" };
        if (bearer === "refused") return { outcome: "refused", detail: "service account refused" };
        const response = await request(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.projectId)}/messages:send`, {
          method: "POST",
          headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
          body: JSON.stringify(fcmMessage(target.token, notification)),
          signal: AbortSignal.timeout(REQUEST_MS),
        });
        if (response.ok) return { outcome: "sent", detail: null };
        const code = errorCode(await response.json().catch(() => null));
        // The app was removed, or the push token belongs to another project's app.
        if (response.status === 404 || code === "UNREGISTERED" || code === "SENDER_ID_MISMATCH") return { outcome: "gone", detail: code ?? "UNREGISTERED" };
        if (response.status === 401 && !renewed) {
          renewed = true;
          access = null;
          return { outcome: "again", detail: code };
        }
        if (response.status === 401 || response.status === 403) return { outcome: "refused", detail: code ?? "refused" };
        if (response.status === 429 || response.status >= 500) return { outcome: "again", detail: code ?? `HTTP ${response.status}` };
        // Anything else means the message itself was wrong. The push token is kept: that is ours to fix, not the phone's.
        return { outcome: "failed", detail: code ?? `HTTP ${response.status}` };
      }, wait);
    },
  };
}

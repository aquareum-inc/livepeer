import "server-only";

import { sign } from "node:crypto";
import { connect, constants, type ClientHttp2Session } from "node:http2";

import type { ApnsCredentials } from "./credentials";
import { withRetries, type Attempt } from "./retry";
import type { PushNotification, PushSender, PushTarget } from "./types";

/** Apple's push service: one for released builds, one for development builds. */
export const APNS_HOSTS: Record<PushTarget["environment"], string> = { production: "https://api.push.apple.com", development: "https://api.sandbox.push.apple.com" };

/** Apple refuses a signed token older than an hour, and refuses a new one more than every 20 minutes. */
const TOKEN_LIFE_MS = 50 * 60_000;
const REQUEST_MS = 10_000;
const IDLE_MS = 60_000;

export interface ApnsOptions {
  credentials: ApnsCredentials;
  /** The app's bundle identifier. */
  topic: string;
  hosts?: Record<PushTarget["environment"], string>;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}

/** What iOS is handed: the words, the default sound, and where in the console to go. Nothing else. */
export function apnsPayload(notification: PushNotification): Record<string, unknown> {
  return {
    aps: { alert: { title: notification.title, body: notification.body }, sound: "default", "thread-id": "console", ...(notification.urgent ? { "interruption-level": "time-sensitive" } : {}) },
    kind: notification.kind,
    opens: notification.opens,
  };
}

const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** Sends through Apple's HTTP/2 provider API, signing with the publisher's own key. No dependency: node:http2 and node:crypto. */
export function apnsSender({ credentials, topic, hosts = APNS_HOSTS, now = Date.now, wait }: ApnsOptions): PushSender {
  let signed: { value: string; at: number } | null = null;
  const sessions = new Map<string, ClientHttp2Session>();

  const bearer = (): string => {
    if (signed && now() - signed.at < TOKEN_LIFE_MS) return signed.value;
    const unsigned = `${part({ alg: "ES256", kid: credentials.keyId })}.${part({ iss: credentials.teamId, iat: Math.floor(now() / 1000) })}`;
    signed = { value: `${unsigned}.${sign("sha256", Buffer.from(unsigned), { key: credentials.key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`, at: now() };
    return signed.value;
  };

  /** One connection per service, reused while it lasts and closed after a minute with nothing to send. */
  const session = (host: string): ClientHttp2Session => {
    const open = sessions.get(host);
    if (open && !open.closed && !open.destroyed) return open;
    const fresh = connect(host);
    const forget = () => {
      if (sessions.get(host) === fresh) sessions.delete(host);
    };
    fresh.on("error", forget);
    fresh.on("close", forget);
    fresh.setTimeout(IDLE_MS, () => fresh.close());
    fresh.unref();
    sessions.set(host, fresh);
    return fresh;
  };

  const post = (target: PushTarget, notification: PushNotification): Promise<{ status: number; reason: string | null }> =>
    new Promise((resolve, reject) => {
      const request = session(hosts[target.environment]).request({
        ":method": "POST",
        ":path": `/3/device/${target.token}`,
        authorization: `bearer ${bearer()}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(now() / 1000) + notification.lifeSeconds),
        "apns-collapse-id": notification.collapse,
        "content-type": "application/json",
      });
      let status = 0;
      let body = "";
      request.setEncoding("utf8");
      request.setTimeout(REQUEST_MS, () => request.close(constants.NGHTTP2_CANCEL));
      request.on("response", (headers) => {
        status = Number(headers[":status"]);
      });
      request.on("data", (chunk: string) => {
        body += chunk;
      });
      request.on("error", reject);
      request.on("close", () => {
        if (status === 0) return reject(new Error("no answer"));
        let reason: string | null = null;
        try {
          const parsed = JSON.parse(body) as { reason?: unknown };
          reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 60) : null;
        } catch {
          reason = null;
        }
        resolve({ status, reason });
      });
      request.end(JSON.stringify(apnsPayload(notification)));
    });

  return {
    offers: (platform) => platform === "ios",
    send(target, notification) {
      let renewed = false;
      return withRetries(async (): Promise<Attempt> => {
        const { status, reason } = await post(target, notification);
        if (status === 200) return { outcome: "sent", detail: null };
        // The phone no longer has the app, or the push token was never this app's.
        if (status === 410 || (status === 400 && (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic"))) return { outcome: "gone", detail: reason ?? "Unregistered" };
        if (status === 403 && reason === "ExpiredProviderToken" && !renewed) {
          renewed = true;
          signed = null;
          return { outcome: "again", detail: reason };
        }
        if (status === 403) return { outcome: "refused", detail: reason ?? "refused" };
        if (status === 429 || status >= 500) return { outcome: "again", detail: reason ?? `HTTP ${status}` };
        return { outcome: "failed", detail: reason ?? `HTTP ${status}` };
      }, wait);
    },
  };
}

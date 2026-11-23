import type { ApiKey, CapabilityRun, CreatedApiKey, Preferences, VerifiedApiKey } from "../types";
import type { Owner } from "./shared";

/** A key and the workspace whose credit it spends; null is the personal account. */
interface StoredKey extends ApiKey {
  scope: string | null;
}

const keys: StoredKey[] = [
  { id: "key_studio_cli", label: "Studio CLI", prefix: "lpk_7Qm2", created_at: "2026-10-02T09:12:00Z", last_used_at: "2026-11-17T18:41:00Z", status: "active", created_by: null, scope: null },
  { id: "key_render_agent", label: "Render agent", prefix: "lpk_c81F", created_at: "2026-10-20T14:30:00Z", last_used_at: "2026-11-16T07:05:00Z", status: "active", created_by: null, scope: null },
  { id: "key_northlight_render", label: "Render queue", prefix: "lpk_Nq4x", created_at: "2026-10-21T10:05:00Z", last_used_at: "2026-11-22T12:54:00Z", status: "active", created_by: "Inés Castellanos", scope: "wsp_northlight" },
];
let sequence = 0;
/** Full keys issued in this process, so the instance API can accept them. A real store keeps only a hash. */
const secrets = new Map<string, string>();

const listed = ({ scope: _scope, ...key }: StoredKey): ApiKey => ({ ...key });

/** The keys of one account: a workspace's (`scope`), or the personal ones. */
export function listStoredKeys(scope: string | null = null): ApiKey[] {
  return keys.filter((key) => key.scope === scope).map(listed);
}

export function createStoredKey(label: string, owner: Owner | null = null): CreatedApiKey {
  sequence += 1;
  const body = Array.from({ length: 32 }, (_, index) => "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[(index * 17 + sequence * 31 + label.length * 7) % 55]).join("");
  const key: StoredKey = { id: `key_${Date.now().toString(36)}${sequence}`, label, prefix: `lpk_${body.slice(0, 4)}`, created_at: new Date().toISOString(), last_used_at: null, status: "active", created_by: owner?.by ?? null, scope: owner?.scope ?? null };
  keys.unshift(key);
  secrets.set(`lpk_${body}`, key.id);
  return { ...listed(key), secret: `lpk_${body}` };
}

/** The active key a bearer token belongs to and the workspace it spends from, or null. */
export function verifyStoredKey(secret: string): VerifiedApiKey | null {
  const key = keys.find((entry) => entry.id === secrets.get(secret));
  return key && key.status === "active" ? { ...listed(key), workspace_id: key.scope } : null;
}

export function revokeStoredKey(id: string, scope: string | null = null): ApiKey | null {
  const key = keys.find((entry) => entry.id === id && entry.scope === scope);
  if (!key) return null;
  key.status = "revoked";
  return listed(key);
}

const DEFAULTS: Preferences = {
  ageConfirmed: false,
  adultContent: false,
  saveChats: true,
  confirmBeforeSpending: true,
  enterSends: true,
  completionNotifications: true,
  defaultAspect: "16:9",
  defaultDuration: 5,
};
const preferences = new Map<string, Preferences>();

export function readStoredPreferences(userId: string): Preferences {
  return { ...(preferences.get(userId) ?? DEFAULTS) };
}

export function updateStoredPreferences(userId: string, patch: Partial<Preferences>): Preferences {
  const next = { ...readStoredPreferences(userId), ...patch };
  // Adult content needs a confirmed age; withdrawing the confirmation switches it off.
  if (!next.ageConfirmed) next.adultContent = false;
  preferences.set(userId, next);
  return { ...next };
}

const SAMPLE_RESPONSES: Array<[RegExp, unknown]> = [
  [/chat/, { choices: [{ message: { role: "assistant", content: "A slow push works here: start wide on the harbour, end on the lamp." } }], usage: { prompt_tokens: 42, completion_tokens: 19 } }],
  [/understanding/, { summary: "A runner crosses a wet street at night; the camera tracks alongside.", moments: [{ at: 0.0, label: "Runner enters frame" }, { at: 2.4, label: "Neon sign reflection" }, { at: 4.1, label: "Runner exits right" }] }],
  [/transcription/, { text: "We're live in five. What's the show about tonight?", segments: [{ start: 0, end: 2.9, text: "We're live in five." }] }],
  [/transcode|ffmpeg/, { output: { url: "https://media.example.test/out/8f2c.mp4", width: 1280, height: 720, codec: "h264" } }],
];

export function runStoredCapability(app: string, request: unknown): CapabilityRun {
  const sample = SAMPLE_RESPONSES.find(([pattern]) => pattern.test(app))?.[1] ?? { output: { url: "https://media.example.test/out/3a91.bin" } };
  return { app, request, response: sample, status: 200, elapsed_ms: 640 + (app.length % 7) * 90, credits_charged: /video/.test(app) ? 55 : 2 };
}

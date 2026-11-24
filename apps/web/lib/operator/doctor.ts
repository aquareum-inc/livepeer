import "server-only";

import type { SystemCheck } from "@livepeer/operator-console";

import { env } from "../env";
import { instance } from "../instance";
import { pushSetup } from "../push";

async function probe(url: URL, token?: string): Promise<number> {
  try {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return response.status;
  } catch {
    return 0;
  }
}

/** The same checks as `livepeer doctor`, run from inside the app. Never returns a secret. */
export async function runDoctor(): Promise<SystemCheck[]> {
  const checks: SystemCheck[] = [];
  const add = (name: string, ok: boolean, detail: string, fix?: string) => checks.push({ name, ok, detail, ...(fix && !ok ? { fix } : {}) });
  const mockOnly = env("MOCK_ONLY") === "1" || env("MOCK_ONLY") === "true";

  try {
    const config = await instance();
    add("Instance config", true, `valid (${config.name})`);
  } catch (error) {
    add("Instance config", false, "invalid", error instanceof Error ? error.message : "Fix instance.config.json");
  }

  const secret = env("SESSION_SECRET") ?? "";
  add("SESSION_SECRET", secret.length >= 32 || mockOnly, secret.length >= 32 ? "set" : mockOnly ? "development default (mock-only)" : "missing", "Set a 32+ character SESSION_SECRET in .env");

  // Alerts to operators' phones are optional: no credentials is fine, half-set or unreadable ones are not.
  if ((await instance()).surfaces.mobileConsole === true) {
    const setup = await pushSetup();
    add("Alerts to iPhone", setup.ios.state !== "problem", setup.ios.state === "none" ? "not set up (optional)" : setup.ios.detail, "Set APNS_KEY (the .p8 file as base64 on one line), APNS_KEY_ID and APNS_TEAM_ID in .env, and mobile.ios.bundleId in the config");
    add("Alerts to Android", setup.android.state !== "problem", setup.android.state === "none" ? "not set up (optional)" : setup.android.detail, "Set FCM_SERVICE_ACCOUNT (the service account's JSON as base64 on one line) in .env, and mobile.android.firebase in the config from the same Firebase project");
  }

  if (mockOnly) {
    add("Engine", true, "skipped in mock-only mode");
    add("Payment provider", true, "built-in mock");
    return checks;
  }

  const url = (await instance()).engine?.url ?? env("ENGINE_URL");
  if (!url) {
    add("Engine", false, "ENGINE_URL is not set", "Set ENGINE_URL in .env, or MOCK_ONLY=1 to run without the engine");
    return checks;
  }
  const ready = await probe(new URL("/readyz", url));
  add("Engine", ready === 200, ready === 200 ? "reachable" : ready === 0 ? "unreachable" : `HTTP ${ready}`, `Check the engine is running at ${url}`);
  if (ready !== 200) return checks;

  const reader = env("ENGINE_READER_TOKEN");
  const readerStatus = reader ? await probe(new URL("/v1/jobs?limit=1", url), reader) : -1;
  add("Reader token", readerStatus === 200, reader ? (readerStatus === 200 ? "accepted" : `refused (HTTP ${readerStatus})`) : "missing", "ENGINE_READER_TOKEN must be an auditor key issued by the engine");

  const admin = env("ENGINE_ADMIN_TOKEN");
  const adminStatus = admin ? await probe(new URL("/v1/admin/grants", url), admin) : -1;
  add("Admin token", adminStatus === 200, admin ? (adminStatus === 200 ? "accepted" : `refused (HTTP ${adminStatus})`) : "missing", "ENGINE_ADMIN_TOKEN must be an admin key. An actor (builder) key is refused with 403.");
  add("Payment provider", adminStatus === 200, adminStatus === 200 ? "reachable through the engine" : "not verified", "Fix the admin token; grants are read through it");
  return checks;
}

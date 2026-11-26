import "server-only";

import { env } from "../env";

/** The secret that seals cookies. Required in production; a fixed value is used only in development. */
export function sessionSecret(): string {
  const secret = env("SESSION_SECRET");
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production" && !mockMode()) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }
  return "development-only-session-secret-not-for-production";
}

export function mockMode(): boolean {
  const value = env("MOCK_ONLY");
  return value === "1" || value === "true";
}

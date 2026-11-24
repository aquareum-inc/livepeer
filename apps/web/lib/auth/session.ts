import "server-only";

import { cookies } from "next/headers";

import { env, isDev } from "../env";
import { instance } from "../instance";
import { mockProvider } from "./mock-provider";
import { oidcProvider } from "./oidc-provider";
import { seal, unseal } from "./seal";
import type { AuthProvider, Identity, Session } from "./types";

export const SESSION_COOKIE = "aq_session";
export const FLOW_COOKIE = "aq_auth_flow";
const SESSION_HOURS = 8;

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

/** The mock provider is available in development and mock-only mode, never to real end users. */
export async function authProvider(): Promise<AuthProvider> {
  const auth = (await instance()).auth;
  if (auth?.provider === "oidc" && auth.oidc) {
    const secret = env("OIDC_CLIENT_SECRET");
    return oidcProvider({ issuer: auth.oidc.issuer, clientId: auth.oidc.clientId, ...(auth.oidc.methodParam ? { methodParam: auth.oidc.methodParam } : {}), ...(secret ? { clientSecret: secret } : {}) });
  }
  if (!isDev && !mockMode()) {
    throw new Error('auth.provider is "mock", which is only available in development or with MOCK_ONLY=1.');
  }
  return mockProvider;
}

export function createSession(identity: Identity): Session {
  return {
    ...identity,
    // Dev shortcut: one fixed builder. Real sign-up provisions a key per user with the admin token.
    builderKey: env("BUILDER_API_KEY") ?? null,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600,
  };
}

export function readSessionValue(value: string | undefined): Session | null {
  if (!value) return null;
  const session = unseal<Session>(value, sessionSecret());
  return session && session.expiresAt * 1000 > Date.now() ? session : null;
}

export async function getSession(): Promise<Session | null> {
  return readSessionValue((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function writeSession(session: Session): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, seal(session, sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

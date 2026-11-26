import "server-only";

import { cookies } from "next/headers";

import { env, isDev } from "../env";
import { instance } from "../instance";
import { operators } from "../operators";
import { mockProvider } from "./mock-provider";
import { oidcProvider } from "./oidc-provider";
import { seal, unseal } from "./seal";
import { mockMode, sessionSecret } from "./secret";
import type { AuthProvider, Identity, Session } from "./types";

export { mockMode, sessionSecret };

export const SESSION_COOKIE = "aq_session";
export const FLOW_COOKIE = "aq_auth_flow";
const SESSION_HOURS = 8;

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

/**
 * A new session for someone who has just signed in. `operatorSource` says on whose word they are an
 * operator; `authenticatedAt` is when the provider says they actually signed in.
 */
export function createSession(identity: Identity, signedIn: { operatorSource?: Session["operatorSource"]; authenticatedAt?: number | null } = {}): Session {
  return {
    ...identity,
    ...(identity.role === "operator" && signedIn.operatorSource ? { operatorSource: signedIn.operatorSource } : {}),
    authenticatedAt: signedIn.authenticatedAt ?? null,
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

/**
 * A session as it stands now. The cookie says who signed in; a place on the team that this instance granted
 * can be taken away while the cookie is still good, so it is read again here. Someone removed from the team
 * is a user from their next request.
 */
export async function current(session: Session | null): Promise<Session | null> {
  if (session?.role !== "operator" || session.operatorSource !== "grant") return session;
  if (await operators().granted(session.userId)) return session;
  const { operatorSource: _gone, ...rest } = session;
  return { ...rest, role: "user" };
}

export async function getSession(): Promise<Session | null> {
  return current(readSessionValue((await cookies()).get(SESSION_COOKIE)?.value));
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

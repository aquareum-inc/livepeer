import "server-only";

import { createHash } from "node:crypto";

import type { AuthProvider, Identity } from "./types";

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

export interface OidcOptions {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  /** Claim that marks an operator: a `roles` or `groups` array containing this value. */
  operatorRole?: string;
  /** Authorization parameter naming the chosen method, e.g. "connection" or "kc_idp_hint". */
  methodParam?: string;
}

/**
 * A provider's answer, or an error that says which step failed and the provider's own error code. The code
 * is one of a fixed few (`invalid_client`, `invalid_grant`…) and holds nothing secret, so it can be logged.
 */
async function json<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const code = typeof body?.error === "string" && /^[a-z_]{1,40}$/.test(body.error) ? ` (${body.error})` : "";
    throw new Error(`OIDC ${what} failed with ${response.status}${code}`);
  }
  return (await response.json()) as T;
}

/**
 * The ID token's claims. The token came straight from the provider's token endpoint over TLS, in exchange
 * for our own code and verifier, so its claims are read without checking its signature (OpenID Connect
 * Core 3.1.3.7). Empty when there is no token or it can't be read.
 */
function idTokenClaims(idToken: string | undefined): Record<string, unknown> {
  try {
    const claims: unknown = JSON.parse(Buffer.from(idToken?.split(".")[1] ?? "", "base64url").toString("utf8"));
    return claims && typeof claims === "object" && !Array.isArray(claims) ? (claims as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Authorization-code flow with PKCE against any OpenID Connect issuer. */
export function oidcProvider(options: OidcOptions): AuthProvider {
  let discovery: Promise<Discovery> | null = null;
  const discover = () =>
    (discovery ??= fetch(new URL(".well-known/openid-configuration", options.issuer.replace(/\/?$/, "/"))).then((r) =>
      json<Discovery>(r, "discovery"),
    ));

  return {
    id: "oidc",
    async authorizationUrl({ redirectUri, state, codeVerifier, method, email, fresh }) {
      const { authorization_endpoint } = await discover();
      const url = new URL(authorization_endpoint);
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: options.clientId,
        redirect_uri: redirectUri,
        scope: "openid profile email",
        state,
        code_challenge: createHash("sha256").update(codeVerifier).digest("base64url"),
        code_challenge_method: "S256",
        // Tell the provider what was picked, so it can skip its own chooser.
        [options.methodParam ?? "connection"]: method,
        ...(email ? { login_hint: email } : {}),
        // A sign-in that must be new: the provider asks again even when it has a session for this browser.
        ...(fresh ? { prompt: "login", max_age: "0" } : {}),
      }).toString();
      return url.toString();
    },
    async exchange({ code, redirectUri, codeVerifier }) {
      const { token_endpoint, userinfo_endpoint } = await discover();
      const tokens = await json<{ access_token: string; id_token?: string }>(
        await fetch(token_endpoint, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            client_id: options.clientId,
            code_verifier: codeVerifier,
            ...(options.clientSecret ? { client_secret: options.clientSecret } : {}),
          }),
        }),
        "token exchange",
      );
      // Who signed in is said twice: in the ID token, and by the userinfo endpoint. Userinfo is asked because
      // some providers keep the name and email there, and it wins where both speak. It is not required: a
      // provider whose access token is meant for an API of its own refuses it at userinfo, and its ID token
      // then says all there is.
      const fromToken = idTokenClaims(tokens.id_token);
      let fromUserinfo: Record<string, unknown> = {};
      let userinfoError: unknown = null;
      try {
        fromUserinfo = await json<Record<string, unknown>>(await fetch(userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.access_token}` } }), "userinfo");
      } catch (error) {
        userinfoError = error;
      }
      // The two must be about one person (OpenID Connect Core 5.3.2), or userinfo's answer is not used.
      const claims = typeof fromToken.sub === "string" && typeof fromUserinfo.sub === "string" && fromToken.sub !== fromUserinfo.sub ? fromToken : { ...fromToken, ...fromUserinfo };
      if (typeof claims.sub !== "string" || !claims.sub) throw userinfoError instanceof Error ? userinfoError : new Error("OIDC sign-in named nobody: no sub in the ID token or userinfo");
      const roles = [claims.roles, claims.groups].flatMap((value) => (Array.isArray(value) ? value : []));
      const identity: Identity = {
        userId: String(claims.sub),
        name: String(claims.name ?? claims.preferred_username ?? claims.email ?? claims.sub),
        email: typeof claims.email === "string" ? claims.email : null,
        role: roles.includes(options.operatorRole ?? "operator") ? "operator" : "user",
      };
      const signedInAt = fromToken.auth_time;
      return { identity, authenticatedAt: typeof signedInAt === "number" && Number.isFinite(signedInAt) ? signedInAt : null };
    },
  };
}

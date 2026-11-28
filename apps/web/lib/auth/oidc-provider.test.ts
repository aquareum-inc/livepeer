import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { oidcProvider } from "./oidc-provider";

const ISSUER = "https://id.example.test";
const idToken = (claims: Record<string, unknown>) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A provider that answers discovery, then the token and userinfo requests as told. */
function provider(token: Response, userinfo: Response) {
  const asked: { url: string; body: string; authorization: string | null }[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    asked.push({ url, body: String(init?.body ?? ""), authorization: new Headers(init?.headers).get("authorization") });
    if (url.endsWith("/.well-known/openid-configuration")) return answer({ authorization_endpoint: `${ISSUER}/auth`, token_endpoint: `${ISSUER}/token`, userinfo_endpoint: `${ISSUER}/me` });
    return url.endsWith("/token") ? token : userinfo;
  });
  return asked;
}

const exchange = () => oidcProvider({ issuer: ISSUER, clientId: "web_test", clientSecret: "a-client-secret" }).exchange({ code: "the-code", redirectUri: "https://app.example.test/auth/callback", codeVerifier: "the-verifier" });

afterEach(() => vi.unstubAllGlobals());

describe("who an OIDC sign-in says signed in", () => {
  it("is read from userinfo, with the sign-in time from the ID token", async () => {
    const asked = provider(answer({ access_token: "at", id_token: idToken({ sub: "u1", auth_time: 1_795_000_000 }) }), answer({ sub: "u1", name: "Ola Nowak", email: "ola@example.test" }));
    expect(await exchange()).toEqual({ identity: { userId: "u1", name: "Ola Nowak", email: "ola@example.test", role: "user" }, authenticatedAt: 1_795_000_000 });
    expect(asked[1]!.body).toContain("client_secret=a-client-secret");
    expect(asked[2]).toMatchObject({ url: `${ISSUER}/me`, authorization: "Bearer at" });
  });

  it("is read from the ID token when the provider refuses its access token at userinfo", async () => {
    provider(answer({ access_token: "a-token-for-the-providers-own-api", id_token: idToken({ sub: "u1", name: "Ola Nowak", email: "ola@example.test", roles: ["operator"] }) }), answer({ error: "invalid_token" }, 401));
    expect(await exchange()).toEqual({ identity: { userId: "u1", name: "Ola Nowak", email: "ola@example.test", role: "operator" }, authenticatedAt: null });
  });

  it("takes userinfo's word where both speak, and names someone by their id when neither gives a name", async () => {
    provider(answer({ access_token: "at", id_token: idToken({ sub: "u1", name: "An old name" }) }), answer({ sub: "u1", name: "Ola Nowak", groups: ["operator"] }));
    expect((await exchange()).identity).toEqual({ userId: "u1", name: "Ola Nowak", email: null, role: "operator" });
    provider(answer({ access_token: "at", id_token: idToken({ sub: "u2" }) }), answer({ error: "invalid_token" }, 401));
    expect((await exchange()).identity).toEqual({ userId: "u2", name: "u2", email: null, role: "user" });
  });

  it("ignores a userinfo answer about somebody else", async () => {
    provider(answer({ access_token: "at", id_token: idToken({ sub: "u1", name: "Ola Nowak" }) }), answer({ sub: "someone-else", name: "Mallory", roles: ["operator"] }));
    expect((await exchange()).identity).toEqual({ userId: "u1", name: "Ola Nowak", email: null, role: "user" });
  });

  it("fails, saying which step and the provider's error code, when the code or the client is refused", async () => {
    provider(answer({ error: "invalid_client", error_description: "client authentication failed" }, 401), answer({}));
    await expect(exchange()).rejects.toThrow("OIDC token exchange failed with 401 (invalid_client)");
    // Nothing a provider puts in a description, or anything that isn't an error code, reaches the message.
    provider(answer({ error: "a secret: xyz", error_description: "the secret was a-client-secret" }, 400), answer({}));
    await expect(exchange()).rejects.toThrow(/^OIDC token exchange failed with 400$/);
  });

  it("fails when nothing says who signed in", async () => {
    provider(answer({ access_token: "at" }), answer({ error: "invalid_token" }, 401));
    await expect(exchange()).rejects.toThrow("OIDC userinfo failed with 401 (invalid_token)");
    provider(answer({ access_token: "at" }), answer({ name: "Nobody in particular" }));
    await expect(exchange()).rejects.toThrow("no sub in the ID token or userinfo");
  });
});

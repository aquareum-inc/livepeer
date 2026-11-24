import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET as callback } from "../../app/auth/callback/route";
import { GET as start } from "../../app/auth/start/route";
import { oidcProvider } from "../auth/oidc-provider";
import { devices } from "../devices";
import { operatorAudit, operatorDevices } from "./index";
import { TEST_CHALLENGE, TEST_VERIFIER, testPhone } from "./testing";

/** The console's sign-in on a phone, through the sign-in routes themselves. */
const dir = mkdtempSync(path.join(tmpdir(), "livepeer-operator-sign-in-"));
const configFile = path.join(dir, "instance.config.json");
const APP = "org.livepeer.app.dev://auth";
const STATE = "the-apps-own-state-0123456789";
let writes = 0;

function configure(extra: Record<string, unknown> = {}, mobileConsole = true) {
  writeFileSync(configFile, JSON.stringify({ name: "Test", surfaces: { app: true, console: true, api: true, mcp: true, mobile: true, mobileConsole }, mobile: { ios: { bundleId: "org.livepeer.app.dev" } }, ...extra }));
  const next = new Date(statSync(configFile).mtimeMs + 2000 * (writes += 1));
  utimesSync(configFile, next, next);
}

beforeAll(async () => {
  vi.stubEnv("INSTANCE_CONFIG", configFile);
  vi.stubEnv("DATA_DIR", path.join(dir, "data"));
  vi.stubEnv("MOCK_ONLY", "1");
  vi.stubEnv("SESSION_SECRET", "a-session-secret-for-the-operator-sign-in-tests");
  configure();
});
afterEach(async () => vi.unstubAllGlobals());
afterAll(async () => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

/** Runs a native sign-in from start to the app's callback, as the system auth session would. */
async function signIn(query: Record<string, string>, provider?: (location: URL) => URL): Promise<URLSearchParams> {
  const begun = await start(new NextRequest(`http://localhost/auth/start?${new URLSearchParams({ client: "ios", challenge: TEST_CHALLENGE, state: STATE, ...query })}`));
  const first = new URL(begun.headers.get("location")!);
  // Refused at the start: the app is sent straight back with the reason.
  if (!provider && first.pathname !== "/auth/callback") return first.searchParams;
  const back = provider ? provider(first) : first;
  const cookie = begun.cookies.get("aq_auth_flow")!.value;
  const done = await callback(new NextRequest(back, { headers: { cookie: `aq_auth_flow=${cookie}` } }));
  const location = done.headers.get("location")!;
  expect(location.startsWith(`${APP}?`)).toBe(true);
  return new URL(location).searchParams;
}

describe("signing in to the console on a phone", () => {
  it("gives an operator a code that only enrols an operator phone, and gives the user sign-in nothing of the kind", async () => {
    const result = await signIn({ method: "operator", purpose: "operator" });
    expect(Object.fromEntries(result)).toEqual({ code: expect.any(String), state: STATE, purpose: "operator" });
    const code = result.get("code")!;
    // The user app's exchange doesn't know the code.
    expect(await devices().redeemCode({ code, verifier: TEST_VERIFIER, deviceName: "x", platform: "ios" })).toBeNull();
    const issued = (await operatorDevices().redeemCode({ code, verifier: TEST_VERIFIER, deviceName: "Sam's iPhone", platform: "ios", publicKey: testPhone().rawPublicKey }))!;
    expect(issued.token.startsWith("aqo_")).toBe(true);
    expect((await operatorAudit().list(1))[0]).toMatchObject({ event: "sign_in", user_id: "usr_demo_sam", device_name: "Sam's iPhone" });

    // And the other way round: a user sign-in's code enrols no operator phone, operator or not.
    const user = await signIn({ method: "email" });
    expect(user.get("purpose")).toBeNull();
    expect(await operatorDevices().redeemCode({ code: user.get("code")!, verifier: TEST_VERIFIER, deviceName: "x", platform: "ios", publicKey: testPhone().rawPublicKey })).toBeNull();
  });

  it("turns away anyone the provider doesn't mark as an operator", async () => {
    const result = await signIn({ method: "email", purpose: "operator" });
    expect(Object.fromEntries(result)).toEqual({ error: "not_operator", state: STATE });
  });

  it("keeps the development operator sign-in out of the user app's flow", async () => {
    expect(Object.fromEntries(await signIn({ method: "operator" }))).toEqual({ error: "method", state: STATE });
  });

  it("doesn't start while the console on phones is off, and doesn't finish if it is switched off midway", async () => {
    configure({}, false);
    expect(Object.fromEntries(await signIn({ method: "operator", purpose: "operator" }))).toEqual({ error: "mobile_console_off", state: STATE });
    // The user app's sign-in has its own switch and still works.
    expect((await signIn({ method: "email" })).get("code")).toEqual(expect.any(String));

    configure();
    const begun = await start(new NextRequest(`http://localhost/auth/start?${new URLSearchParams({ client: "ios", challenge: TEST_CHALLENGE, state: STATE, method: "operator", purpose: "operator" })}`));
    configure({}, false);
    const done = await callback(new NextRequest(begun.headers.get("location")!, { headers: { cookie: `aq_auth_flow=${begun.cookies.get("aq_auth_flow")!.value}` } }));
    expect(Object.fromEntries(new URL(done.headers.get("location")!).searchParams)).toEqual({ error: "mobile_console_off", state: STATE });
    configure();
  });
});

describe("with an OpenID Connect provider", () => {
  const issuer = "https://id.example.test";
  const idToken = (claims: Record<string, unknown>) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

  /** A provider that answers discovery, the token exchange and userinfo. */
  function provider(claims: { roles: string[] }, token: Record<string, unknown>) {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
      const url = String(input);
      if (url.endsWith("/.well-known/openid-configuration")) return Response.json({ authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, userinfo_endpoint: `${issuer}/userinfo` });
      if (url === `${issuer}/token`) return Response.json({ access_token: "at", ...token });
      return Response.json({ sub: "usr_ops_1", name: "Ola Operator", email: "ola@example.test", ...claims });
    }));
  }
  const now = () => Math.floor(Date.now() / 1000);
  /** What the provider does with the authorization request: sends the browser back with a code. */
  const approve = (seen: { url?: URL }) => (location: URL) => {
    seen.url = location;
    return new URL(`http://localhost/auth/callback?code=abc&state=${location.searchParams.get("state")}`);
  };

  beforeAll(async () => configure({ auth: { provider: "oidc", methods: ["email"], oidc: { issuer, clientId: "livepeer" } } }));
  afterAll(async () => configure());

  it("asks the provider for a new sign-in for the console, and only then", async () => {
    provider({ roles: ["operator"] }, { id_token: idToken({ auth_time: now() }) });
    const seen: { url?: URL } = {};
    const result = await signIn({ method: "email", purpose: "operator" }, approve(seen));
    expect(seen.url?.searchParams.get("prompt")).toBe("login");
    expect(seen.url?.searchParams.get("max_age")).toBe("0");
    expect(Object.fromEntries(result)).toEqual({ code: expect.any(String), state: STATE, purpose: "operator" });

    const user: { url?: URL } = {};
    await signIn({ method: "email" }, approve(user));
    expect(user.url?.searchParams.has("prompt")).toBe(false);
    expect(user.url?.searchParams.has("max_age")).toBe(false);
  });

  it("refuses a sign-in the provider didn't make just now, or won't date", async () => {
    provider({ roles: ["operator"] }, { id_token: idToken({ auth_time: now() - 3600 }) });
    expect(Object.fromEntries(await signIn({ method: "email", purpose: "operator" }, approve({})))).toEqual({ error: "not_fresh", state: STATE });
    provider({ roles: ["operator"] }, {});
    expect(Object.fromEntries(await signIn({ method: "email", purpose: "operator" }, approve({})))).toEqual({ error: "not_fresh", state: STATE });
    provider({ roles: ["operator"] }, { id_token: "not-a-token" });
    expect(Object.fromEntries(await signIn({ method: "email", purpose: "operator" }, approve({})))).toEqual({ error: "not_fresh", state: STATE });
  });

  it("refuses a fresh sign-in by someone who isn't an operator", async () => {
    provider({ roles: ["member"] }, { id_token: idToken({ auth_time: now() }) });
    expect(Object.fromEntries(await signIn({ method: "email", purpose: "operator" }, approve({})))).toEqual({ error: "not_operator", state: STATE });
  });

  it("reads when the person signed in from the ID token", async () => {
    provider({ roles: [] }, { id_token: idToken({ auth_time: 1_795_000_000 }) });
    const exchanged = await oidcProvider({ issuer, clientId: "livepeer" }).exchange({ code: "abc", redirectUri: "http://localhost/auth/callback", codeVerifier: "v" });
    expect(exchanged).toEqual({ identity: { userId: "usr_ops_1", name: "Ola Operator", email: "ola@example.test", role: "user" }, authenticatedAt: 1_795_000_000 });
  });
});

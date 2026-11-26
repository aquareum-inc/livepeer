import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET as callback } from "../../app/auth/callback/route";
import { GET as start } from "../../app/auth/start/route";
import { emptyDatabase, useTestDatabase } from "../data/testing";
import { operators } from "../operators";
import { current, readSessionValue } from "./session";
import type { Session } from "./types";

/** Signing in on the web, through the sign-in routes themselves: who becomes an operator, and who is let in at all. */
const dir = mkdtempSync(path.join(tmpdir(), "livepeer-sign-in-"));
const configFile = path.join(dir, "instance.config.json");
let writes = 0;

function configure(signUp: "open" | "invite" | "closed") {
  writeFileSync(configFile, JSON.stringify({ name: "Test", surfaces: { app: false, console: true, api: false, mcp: false, mobile: true }, mobile: { ios: { bundleId: "org.livepeer.app.dev" } }, auth: { provider: "mock", signUp } }));
  const next = new Date(statSync(configFile).mtimeMs + 2000 * (writes += 1));
  utimesSync(configFile, next, next);
}

useTestDatabase();

beforeAll(() => {
  vi.stubEnv("INSTANCE_CONFIG", configFile);
  vi.stubEnv("MOCK_ONLY", "1");
  vi.stubEnv("SESSION_SECRET", "a-session-secret-for-the-web-sign-in-tests");
});
beforeEach(async () => {
  await emptyDatabase();
  configure("open");
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

/** Runs a sign-in from start to finish. Answers where the browser was sent, and the session it was given. */
async function signIn(query: Record<string, string>): Promise<{ location: URL; session: Session | null }> {
  const begun = await start(new NextRequest(`http://localhost/auth/start?${new URLSearchParams(query)}`));
  const done = await callback(new NextRequest(begun.headers.get("location")!, { headers: { cookie: `aq_auth_flow=${begun.cookies.get("aq_auth_flow")!.value}` } }));
  return { location: new URL(done.headers.get("location")!), session: readSessionValue(done.cookies.get("aq_session")?.value) };
}

const OLA = { method: "email", email: "ola@new.example.test" };
const token = (invitationPath: string) => invitationPath.replace("/join/operator/", "");

describe("who a sign-in makes an operator", () => {
  it("takes the identity provider's word, and lists them on the team", async () => {
    const { session, location } = await signIn({ method: "operator", next: "/operator/jobs" });
    expect(location.pathname).toBe("/operator/jobs");
    expect(session).toMatchObject({ userId: "usr_demo_sam", role: "operator", operatorSource: "claim" });
    expect(Math.abs(Date.now() / 1000 - session!.authenticatedAt!)).toBeLessThan(5);
    expect(await operators().operators()).toMatchObject([{ user_id: "usr_demo_sam", role: "owner", via: "provider" }]);
  });

  it("makes a user of everyone else, and keeps them out of the console", async () => {
    const { session, location } = await signIn({ method: "google", next: "/operator" });
    expect(location.pathname).toBe("/");
    expect(session).toMatchObject({ userId: "usr_demo_adam", role: "user" });
    expect(session).not.toHaveProperty("operatorSource");
    expect(await operators().operators()).toEqual([]);
  });

  it("makes an operator of someone on the instance's own team, until they are removed", async () => {
    await signIn({ method: "operator" });
    await operators().add({ userId: "usr_demo_adam", name: "Adam Soffer", email: "adam@example.test" }, "viewer", "usr_demo_sam");

    const { session, location } = await signIn({ method: "google", next: "/operator" });
    expect(location.pathname).toBe("/operator");
    expect(session).toMatchObject({ role: "operator", operatorSource: "grant" });
    expect(await current(session)).toMatchObject({ role: "operator" });

    // Removed while the cookie is still good: a user from the next request, and at the next sign-in.
    expect(await operators().remove("usr_demo_adam")).toBe("done");
    const now = await current(session);
    expect(now).toMatchObject({ userId: "usr_demo_adam", role: "user" });
    expect(now).not.toHaveProperty("operatorSource");
    expect((await signIn({ method: "google" })).session).toMatchObject({ role: "user" });
  });

  it("leaves a session the identity provider vouched for as it is", async () => {
    const { session } = await signIn({ method: "operator" });
    expect(await current(session)).toBe(session);
    expect(await current(null)).toBeNull();
  });
});

describe("an instance that isn't taking new accounts", () => {
  it.each(["closed", "invite"] as const)("turns away someone it has never seen when sign-up is %s", async (mode) => {
    configure(mode);
    const { session, location } = await signIn(OLA);
    expect(`${location.pathname}${location.search}`).toBe("/sign-in?error=closed");
    expect(session).toBeNull();
  });

  it("lets in its operators and the people the provider already has", async () => {
    configure("closed");
    expect((await signIn({ method: "operator" })).session).toMatchObject({ userId: "usr_demo_sam" });
    expect((await signIn({ method: "google" })).session).toMatchObject({ userId: "usr_demo_adam" });
  });

  it("lets a new person in when they arrive from an invitation that can still be used, and back in once they have joined", async () => {
    configure("closed");
    await signIn({ method: "operator" });
    const invitation = await operators().invite("member", "usr_demo_sam");

    const arrived = await signIn({ ...OLA, next: invitation.path });
    expect(arrived.location.pathname).toBe(invitation.path);
    expect(arrived.session).toMatchObject({ userId: "usr_new_ola", name: "Ola", role: "user" });

    await operators().accept(token(invitation.path), { userId: "usr_new_ola", name: "Ola", email: "ola@new.example.test" });
    expect((await signIn(OLA)).session).toMatchObject({ role: "operator", operatorSource: "grant" });
  });

  it("doesn't let a new person in with a link that was revoked, used or never existed", async () => {
    configure("closed");
    await signIn({ method: "operator" });
    const revoked = await operators().invite("member", "usr_demo_sam");
    await operators().revoke(revoked.id);
    expect((await signIn({ ...OLA, next: revoked.path })).session).toBeNull();
    expect((await signIn({ ...OLA, next: "/join/operator/opi_made-up" })).session).toBeNull();

    const used = await operators().invite("member", "usr_demo_sam");
    await operators().accept(token(used.path), { userId: "usr_demo_adam", name: "Adam Soffer", email: "adam@example.test" });
    expect((await signIn({ ...OLA, next: used.path })).session).toBeNull();
  });

  it("tells an app why, in place of a code", async () => {
    configure("closed");
    const begun = await start(new NextRequest(`http://localhost/auth/start?${new URLSearchParams({ ...OLA, client: "ios", challenge: "c".repeat(43), state: "the-apps-own-state-0123456789" })}`));
    const done = await callback(new NextRequest(begun.headers.get("location")!, { headers: { cookie: `aq_auth_flow=${begun.cookies.get("aq_auth_flow")!.value}` } }));
    const back = new URL(done.headers.get("location")!);
    expect(back.protocol).toBe("org.livepeer.app.dev:");
    expect(Object.fromEntries(back.searchParams)).toEqual({ error: "closed", state: "the-apps-own-state-0123456789" });
  });

  it("takes anyone when sign-up is open", async () => {
    expect((await signIn(OLA)).session).toMatchObject({ userId: "usr_new_ola", role: "user" });
  });
});

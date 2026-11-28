import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** The browser's session, which the action reads from a cookie and writes back. */
const browser = vi.hoisted(() => ({ session: null as Record<string, unknown> | null }));
vi.mock("../auth/session", async (original) => ({
  ...(await original<typeof import("../auth/session")>()),
  getSession: async () => browser.session,
  writeSession: async (session: Record<string, unknown>) => {
    browser.session = session;
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

import { emptyDatabase, useTestDatabase } from "../data/testing";
import { operatorAudit } from "../operator-devices";
import { claimInstanceAction } from "./claim";
import { firstOwnerOpen } from "./first-owner";
import { operators } from "./index";

const dir = mkdtempSync(path.join(tmpdir(), "livepeer-first-owner-"));
const configFile = path.join(dir, "instance.config.json");
let writes = 0;

function configure(options: { provider?: "oidc" | "mock"; console?: boolean } = {}) {
  const auth = options.provider === "mock" ? { provider: "mock" } : { provider: "oidc", oidc: { issuer: "https://id.example.test", clientId: "web_test" } };
  writeFileSync(configFile, JSON.stringify({ name: "Test", surfaces: { app: true, console: options.console ?? true, api: false, mcp: false }, auth }));
  const next = new Date(statSync(configFile).mtimeMs + 2000 * (writes += 1));
  utimesSync(configFile, next, next);
}

const ola = { userId: "usr_ola", name: "Ola Nowak", email: "ola@example.test", role: "user", expiresAt: Math.floor(Date.now() / 1000) + 3600 };
const sam = { userId: "usr_sam", name: "Sam Whitfield", email: "sam@example.test" };

useTestDatabase();

beforeAll(() => {
  vi.stubEnv("INSTANCE_CONFIG", configFile);
  vi.stubEnv("SESSION_SECRET", "a-session-secret-for-the-first-owner-tests");
});
beforeEach(async () => {
  await emptyDatabase();
  vi.stubEnv("ENGINE_ADMIN_TOKEN", "");
  vi.stubEnv("MOCK_ONLY", "1");
  configure();
  browser.session = { ...ola };
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("whether an instance may be claimed by whoever signs in", () => {
  it("may, while nobody owns it, it holds no engine admin token and sign-in is a real provider's", async () => {
    expect(await firstOwnerOpen()).toBe(true);
    // Not only in mock-only mode: an engine address and a reader token change nothing.
    vi.stubEnv("MOCK_ONLY", "");
    vi.stubEnv("ENGINE_READER_TOKEN", "lpk_reader");
    expect(await firstOwnerOpen()).toBe(true);
    vi.stubEnv("ENGINE_READER_TOKEN", "");
  });

  it("may not once it has an owner", async () => {
    await operators().claim(sam);
    expect(await firstOwnerOpen()).toBe(false);
  });

  it("may not once it holds the engine's admin token, which is what a stranger could spend with", async () => {
    vi.stubEnv("ENGINE_ADMIN_TOKEN", "lpk_admin");
    expect(await firstOwnerOpen()).toBe(false);
  });

  it("may not with the development sign-in, which has an operator of its own, or with no console", async () => {
    configure({ provider: "mock" });
    expect(await firstOwnerOpen()).toBe(false);
    configure({ console: false });
    expect(await firstOwnerOpen()).toBe(false);
  });
});

describe("claiming an instance", () => {
  it("makes whoever is signed in its owner, writes it in the audit log and opens the console", async () => {
    await expect(claimInstanceAction()).rejects.toThrow("redirect:/operator");
    expect(browser.session).toMatchObject({ userId: "usr_ola", role: "operator", operatorSource: "grant" });
    expect(await operators().operators()).toMatchObject([{ user_id: "usr_ola", role: "owner", via: "setup" }]);
    expect((await operatorAudit().list(1))[0]).toMatchObject({ event: "change", user_id: "usr_ola", operation: "claim_instance" });
  });

  it("refuses the second person, and leaves their session as it was", async () => {
    await operators().claim(sam);
    expect(await claimInstanceAction()).toEqual({ error: "This instance already has an owner. Ask them for an invitation to the team." });
    expect(browser.session).toMatchObject({ role: "user" });
    expect(await operators().operators()).toHaveLength(1);
  });

  it("refuses when the instance holds the engine's admin token, and when nobody is signed in", async () => {
    vi.stubEnv("ENGINE_ADMIN_TOKEN", "lpk_admin");
    expect(await claimInstanceAction()).toMatchObject({ error: expect.stringContaining("already has an owner") });
    expect(await operators().hasOwner()).toBe(false);
    vi.stubEnv("ENGINE_ADMIN_TOKEN", "");
    browser.session = null;
    expect(await claimInstanceAction()).toEqual({ error: "Sign in to set up this instance." });
    expect(await operators().hasOwner()).toBe(false);
  });
});

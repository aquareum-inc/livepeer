import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { preset } from "@livepeer/config";
import { schema } from "@livepeer/db";
import { testDatabase } from "@livepeer/db/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { memoryStore } from "../data/store";
import { effectiveInstance, forgetInstance, instance } from "../instance";
import { readSettings, settingsOf, withCapabilities, withSettings } from "../instance-overrides";
import { currentSettings, resetSettings, saveSettings } from "./settings";
import { documentSettingsStore, postgresSettingsStore, type SavedOverrides, type SettingsStore } from "./settings-store";

const dir = mkdtempSync(path.join(tmpdir(), "livepeer-settings-"));
const file = path.join(dir, "instance.config.json");
const deployed = JSON.stringify({ name: "Northlight", domain: "video.example.test", surfaces: { app: true, console: true, api: true, mcp: false }, auth: { provider: "mock", signUp: "invite" }, theme: { dark: { primary: "oklch(0.9 0 0)" } } });
const overridesFile = () => path.join(dir, "data", "instance-settings.json");

beforeAll(() => {
  writeFileSync(file, deployed);
  vi.stubEnv("INSTANCE_CONFIG", file);
  vi.stubEnv("DATA_DIR", path.join(dir, "data"));
  vi.stubEnv("DATABASE_URL", "");
});
afterEach(async () => {
  await resetSettings("settings");
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("the two layers over the deployed config", () => {
  const base = preset("full");

  it("reads a config as the Settings page's fields and lays them back to the same config", () => {
    expect(withSettings(base, settingsOf(base))).toMatchObject({ name: base.name, surfaces: base.surfaces });
    const changed = withSettings(base, { ...settingsOf(base), name: "  Harbour  ", domain: "", signUp: "closed", surfaces: { app: false, api: true, mcp: true, mobile: false, mobileConsole: false }, adultContent: true });
    expect(changed).toMatchObject({ name: "Harbour", auth: { signUp: "closed" }, surfaces: { app: false, console: base.surfaces.console }, content: { adultContent: true } });
    expect(changed.domain).toBeUndefined();
  });

  it("leaves alone what the page doesn't edit: sign-in, the phone apps, the engine and the console itself", () => {
    const strict = { ...base, auth: { provider: "oidc" as const, oidc: { issuer: "https://id.example.test", clientId: "abc" } }, mobile: { ios: { bundleId: "test.example.app" } }, engine: { url: "http://engine.test" }, surfaces: { ...base.surfaces, console: false } };
    const changed = withSettings(strict, { ...settingsOf(strict), name: "Other" });
    expect(changed).toMatchObject({ auth: { provider: "oidc", oidc: strict.auth.oidc }, mobile: strict.mobile, engine: strict.engine, surfaces: { console: false } });
  });

  it("takes the deployed config's value for any saved field that is missing or of the wrong type", () => {
    const fields = settingsOf(base);
    expect(readSettings(null, fields)).toEqual(fields);
    expect(readSettings({ name: "Harbour", signUp: "sometimes", characters: "yes", surfaces: { api: false, mcp: "no" }, added: "by a later version" }, fields)).toEqual({ ...fields, name: "Harbour", surfaces: { ...fields.surfaces, api: false } });
  });

  it("lays each capability's saved settings over the config's, keeping its patterns and labels", () => {
    const start = { ...base, capabilities: { block: ["*-experimental", "music"], overrides: { music: { label: "Score", surfaces: ["studio" as const] } } }, pricing: { markup: { default: 1.3, perApp: { chat: 2 } } } };
    const changed = withCapabilities(start, { music: { enabled: true, markup: 1.5, surfaces: null }, "text-to-video": { enabled: false, markup: null, surfaces: ["chat", "not-a-surface"] }, chat: { enabled: true, markup: null, surfaces: null } });
    expect(changed.capabilities).toEqual({ block: ["*-experimental", "text-to-video"], overrides: { music: { label: "Score" }, "text-to-video": { surfaces: ["chat"] } } });
    expect(changed.pricing).toEqual({ markup: { default: 1.3, perApp: { music: 1.5 } } });
    expect(withCapabilities(start, {})).toBe(start);
  });
});

describe("settings saved from the console", () => {
  it("applies what is saved over the deployed config, and never writes that config", async () => {
    const before = await currentSettings();
    expect(before).toMatchObject({ saved: false, ignored: false, source: file, settings: { name: "Northlight", signUp: "invite", primaryDark: "oklch(0.9 0 0)" } });

    expect(await saveSettings({ ...before.settings, name: "Harbour", surfaces: { ...before.settings.surfaces, api: false }, retainChats: true })).toEqual({ ok: true });
    expect(await instance()).toMatchObject({ name: "Harbour", domain: "video.example.test", surfaces: { api: false, console: true }, privacy: { retainChats: true }, auth: { provider: "mock", signUp: "invite" } });
    expect(await currentSettings()).toMatchObject({ saved: true, ignored: false });
    expect(readFileSync(file, "utf8")).toBe(deployed);
    expect(JSON.parse(readFileSync(overridesFile(), "utf8")).settings).toMatchObject({ name: "Harbour" });
  });

  it("refuses a save that wouldn't make a valid config, and keeps a logo only as something safe to draw", async () => {
    const { settings } = await currentSettings();
    expect(await saveSettings({ ...settings, name: "   " })).toMatchObject({ ok: false });
    expect((await instance()).name).toBe("Northlight");
    expect(await saveSettings({ ...settings, logoSymbol: "not an image" })).toMatchObject({ ok: false, error: expect.stringMatching(/^Symbol: /) });

    const svg = (body: string) => `data:image/svg+xml;base64,${Buffer.from(body).toString("base64")}`;
    expect(await saveSettings({ ...settings, logoSymbol: svg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="4"/></svg>') })).toEqual({ ok: true });
    const kept = (await instance()).logo?.symbol ?? "";
    expect(Buffer.from(kept.split(",")[1] ?? "", "base64").toString()).toContain("<circle");
    expect(Buffer.from(kept.split(",")[1] ?? "", "base64").toString()).not.toContain("script");
  });

  it("resets to the deployed config", async () => {
    const { settings } = await currentSettings();
    await saveSettings({ ...settings, name: "Harbour" });
    await resetSettings("settings");
    expect(await instance()).toMatchObject({ name: "Northlight" });
    expect(await currentSettings()).toMatchObject({ saved: false });
  });

  it("leaves out a saved change that no longer makes a valid config, says so, and keeps serving", async () => {
    const { settings } = await currentSettings();
    await saveSettings({ ...settings, name: "Harbour" });
    // As if a later version's schema no longer allowed what an earlier one saved.
    writeFileSync(overridesFile(), JSON.stringify({ settings: { ...settings, name: "" }, capabilities: {} }));
    forgetInstance();
    expect(await effectiveInstance()).toMatchObject({ config: { name: "Northlight" }, saved: { settings: true }, ignored: { settings: true } });
    expect(await currentSettings()).toMatchObject({ ignored: true, settings: { name: "Northlight" } });
    // Saving again replaces it.
    expect(await saveSettings({ ...settings, name: "Harbour" })).toEqual({ ok: true });
    expect(await currentSettings()).toMatchObject({ ignored: false, settings: { name: "Harbour" } });
  });

  it("follows a change to the deployed config at once, with what was saved still laid over it", async () => {
    const { settings } = await currentSettings();
    await saveSettings({ ...settings, name: "Harbour" });
    vi.stubEnv("INSTANCE_CONFIG_JSON", JSON.stringify({ name: "From the environment", surfaces: { app: true, console: true, api: true, mcp: true }, pricing: { creditsPerUsd: 250 } }));
    expect(await effectiveInstance()).toMatchObject({ base: { source: "environment", file: null }, config: { name: "Harbour", pricing: { creditsPerUsd: 250 } } });
    expect((await currentSettings()).source).toBe("the INSTANCE_CONFIG_JSON variable");
    vi.stubEnv("INSTANCE_CONFIG_JSON", "");
    expect((await instance()).pricing?.creditsPerUsd).not.toBe(250);
  });
});

const implementations: Array<[string, () => Promise<{ store: SettingsStore; close: () => Promise<void> }>]> = [
  ["a document", async () => ({ store: documentSettingsStore(memoryStore<SavedOverrides>({ settings: null, capabilities: {} })), close: async () => undefined })],
  [
    "Postgres",
    async () => {
      const { db, close } = await testDatabase();
      await db.delete(schema.instanceSettings);
      return { store: postgresSettingsStore(db), close };
    },
  ],
];

describe.each(implementations)("the settings store over %s", (_kind, open) => {
  it("keeps the page's fields as one document and each capability on its own, and forgets either on its own", async () => {
    const { store, close } = await open();
    expect(await store.read()).toEqual({ settings: null, capabilities: {} });

    await store.saveSettings({ name: "Harbour", surfaces: { api: false } });
    await store.saveSettings({ name: "Harbour Films", surfaces: { api: false } });
    await store.saveCapability("music", { enabled: false, markup: 1.5, surfaces: ["chat", "studio"] });
    await store.saveCapability("chat", { enabled: true, markup: null, surfaces: null });
    await store.saveCapability("music", { enabled: true, markup: 1.25, surfaces: null });
    expect(await store.read()).toEqual({ settings: { name: "Harbour Films", surfaces: { api: false } }, capabilities: { music: { enabled: true, markup: 1.25, surfaces: null }, chat: { enabled: true, markup: null, surfaces: null } } });

    await store.reset("capabilities");
    expect(await store.read()).toEqual({ settings: { name: "Harbour Films", surfaces: { api: false } }, capabilities: {} });
    await store.saveCapability("music", { enabled: false, markup: null, surfaces: null });
    await store.reset("settings");
    expect(await store.read()).toEqual({ settings: null, capabilities: { music: { enabled: false, markup: null, surfaces: null } } });
    await close();
  });
});

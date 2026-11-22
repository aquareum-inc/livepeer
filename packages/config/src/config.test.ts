import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ConfigError, PRESET_NAMES, filterCapabilities, isCapabilityEnabled, loadConfig, preset, validateConfig } from "./index";

describe("presets", () => {
  it.each(PRESET_NAMES)("%s is valid against the schema", (name) => {
    expect(() => preset(name)).not.toThrow();
  });

  it("full serves every surface except the phone apps, which an operator opts into", () => {
    expect(preset("full").surfaces).toEqual({ app: true, console: true, api: true, mcp: true, mobile: false, mobileConsole: false });
  });

  it("headless has no app but keeps the console that runs the business", () => {
    expect(preset("headless").surfaces).toEqual({ app: false, console: true, api: true, mcp: true, mobile: false, mobileConsole: false });
  });

  it("no preset offers the console on phones: an operator opts into it", () => {
    for (const name of PRESET_NAMES) expect(preset(name).surfaces.mobileConsole).toBe(false);
    expect(validateConfig({ name: "Console only", surfaces: { app: false, console: true, api: false, mcp: false, mobileConsole: true } }).surfaces.mobileConsole).toBe(true);
  });

  it("the mobile development config is valid and names the development apps", () => {
    const { config } = loadConfig({ cwd: path.resolve(import.meta.dirname, "../../.."), env: { INSTANCE_CONFIG: "docs/mobile/dev.instance.config.json" } });
    expect(config.surfaces.mobile).toBe(true);
    expect(config.mobile).toEqual({ ios: { bundleId: "org.livepeer.app.dev" }, android: { applicationId: "org.livepeer.app.dev" } });
  });

  it("takes a Firebase project's public values for the Android app, whole or not at all", () => {
    const base = { name: "Phones", surfaces: { app: true, console: true, api: true, mcp: true, mobileConsole: true } };
    const firebase = { projectId: "livepeer-test", appId: "1:1234567890:android:0a1b2c3d4e5f", apiKey: "AIzaSyTestTestTestTestTestTestTestTest", senderId: "1234567890" };
    expect(validateConfig({ ...base, mobile: { android: { applicationId: "org.livepeer.app", firebase } } }).mobile?.android?.firebase).toEqual(firebase);
    expect(validateConfig({ ...base, mobile: { android: { applicationId: "org.livepeer.app" } } }).mobile?.android?.firebase).toBeUndefined();
    expect(() => validateConfig({ ...base, mobile: { android: { applicationId: "org.livepeer.app", firebase: { projectId: "livepeer-test" } } } })).toThrow();
    expect(() => validateConfig({ ...base, mobile: { android: { applicationId: "org.livepeer.app", firebase: { ...firebase, appId: "not-an-app-id" } } } })).toThrow();
    // A service account's private key has no place in the config file.
    expect(() => validateConfig({ ...base, mobile: { android: { applicationId: "org.livepeer.app", firebase: { ...firebase, privateKey: "-----BEGIN PRIVATE KEY-----" } } } })).toThrow();
  });

  it("adult content is off by default in both", () => {
    for (const name of PRESET_NAMES) expect(preset(name).content?.adultContent).toBe(false);
  });

  it("both carry Livepeer's marks, drawn in the text colour", () => {
    for (const name of PRESET_NAMES) {
      const { logo } = preset(name);
      expect(logo).toEqual({ symbol: "/brand/livepeer-symbol.svg", wordmark: "/brand/livepeer-wordmark.svg", tint: true });
    }
  });
});

describe("validateConfig", () => {
  it("fills defaults", () => {
    const config = validateConfig({ name: "Acme", surfaces: { app: true, console: false, api: true, mcp: false }, pricing: {} });
    expect(config.pricing?.creditsPerUsd).toBe(100);
  });

  it("reports every problem with its path", () => {
    try {
      validateConfig({ name: "", surfaces: { app: true }, colour: "red" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const paths = (error as ConfigError).issues.map((issue) => issue.path);
      expect(paths).toContain("/name");
      expect(paths).toContain("/surfaces");
      expect((error as ConfigError).message).toContain("colour");
    }
  });

  it("rejects a markup below cost", () => {
    expect(() =>
      validateConfig({ name: "Acme", surfaces: { app: true, console: true, api: true, mcp: true }, pricing: { markup: { default: 0.5 } } }),
    ).toThrow(ConfigError);
  });
});

describe("loadConfig", () => {
  it("falls back to the full preset when no file exists", () => {
    const loaded = loadConfig({ cwd: mkdtempSync(path.join(tmpdir(), "cfg-")), env: {} });
    expect(loaded.file).toBeNull();
    expect(loaded.config.surfaces.app).toBe(true);
  });

  it("reads a file and lets ENGINE_URL override the engine url", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cfg-"));
    writeFileSync(path.join(dir, "instance.config.json"), JSON.stringify({ ...preset("headless"), name: "Acme", engine: { url: "http://a.test" } }));
    const loaded = loadConfig({ cwd: dir, env: { ENGINE_URL: "http://b.test" } });
    expect(loaded.config.name).toBe("Acme");
    expect(loaded.config.engine?.url).toBe("http://b.test");
  });

  it("fails when INSTANCE_CONFIG points at a missing file", () => {
    expect(() => loadConfig({ cwd: tmpdir(), env: { INSTANCE_CONFIG: "nope.json" } })).toThrow(ConfigError);
  });
});

describe("capability rules", () => {
  it("allows everything with an empty allow list", () => {
    expect(isCapabilityEnabled("text-to-video", { allow: [], block: [] })).toBe(true);
  });

  it("lets a headless instance start with transcoding only", () => {
    const rules = { allow: ["*transcode*"], block: [] };
    const offerings = [{ app: "video-transcode" }, { app: "live-transcode" }, { app: "chat" }];
    expect(filterCapabilities(offerings, rules).map((o) => o.app)).toEqual(["video-transcode", "live-transcode"]);
  });

  it("block wins over allow", () => {
    expect(isCapabilityEnabled("media/ffmpeg-live", { allow: ["media/*"], block: ["*-live"] })).toBe(false);
  });
});

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NotOffered } from "@livepeer/api-client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { useTestDatabase } from "../data/testing";
import { apiFor } from "../api";
import { studioOfferings } from "../catalogue";
import { instance } from "../instance";
import { capabilityOverrides, configCapabilityStore, resetSettings } from "./settings";

const dir = mkdtempSync(path.join(tmpdir(), "livepeer-capabilities-"));
const file = path.join(dir, "instance.config.json");
const deployed = JSON.stringify({ name: "Test", surfaces: { app: true, console: true, api: true, mcp: true }, capabilities: { block: ["*-experimental"], overrides: { music: { label: "Score" } } } });
const offering = (app: string) => ({ app, modes: ["single-shot"] }) as never;
const store = async () => configCapabilityStore(await instance());

useTestDatabase();

beforeAll(() => {
  writeFileSync(file, deployed);
  vi.stubEnv("INSTANCE_CONFIG", file);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("MOCK_ONLY", "1");
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("capability settings saved from the console", () => {
  it("switches a capability off and on as an exact entry in the block list, keeping the deployed config's own rules", async () => {
    const capabilities = await store();
    await capabilities.write("text-to-image", { enabled: false });
    expect((await instance()).capabilities?.block).toEqual(["*-experimental", "text-to-image"]);
    expect(capabilities.read("text-to-image").enabled).toBe(false);
    expect((await studioOfferings([offering("text-to-image"), offering("text-to-video")])).map((entry: { app: string }) => entry.app)).toEqual(["text-to-video"]);
    const client = await apiFor(null);
    expect((await client.listOfferings()).data.some((entry) => entry.app === "text-to-image")).toBe(false);
    await expect(client.createGeneration({ kind: "image", app: "text-to-image", prompt: "A lighthouse", aspect: "1:1", duration_seconds: null, resolution: null })).rejects.toThrow(NotOffered);
    await capabilities.write("text-to-image", { enabled: true });
    expect((await instance()).capabilities?.block).toEqual(["*-experimental"]);
  });

  it("places a capability with a surface override, keeping its label", async () => {
    const capabilities = await store();
    await capabilities.write("music", { surfaces: ["chat"] });
    expect((await instance()).capabilities?.overrides?.music).toEqual({ label: "Score", surfaces: ["chat"] });
    expect(await studioOfferings([offering("music")])).toEqual([]);
    await capabilities.write("music", { surfaces: null });
    expect((await instance()).capabilities?.overrides?.music).toEqual({ label: "Score" });
    expect(capabilities.read("music").surfaces).toBeNull();
  });

  it("keeps markups in pricing and refuses one below 1", async () => {
    const capabilities = await store();
    await capabilities.write("music", { markup: 1.5 });
    expect((await instance()).pricing?.markup?.perApp).toEqual({ music: 1.5 });
    await expect(capabilities.write("music", { markup: 0.5 })).rejects.toThrow();
    expect((await instance()).pricing?.markup?.perApp).toEqual({ music: 1.5 });
  });

  it("changes one capability without disturbing another, whoever saved first", async () => {
    // Two operators with the page open: each holds the config as it was when their request began.
    const [first, second] = [await store(), await store()];
    await first.write("text-to-video", { markup: 2 });
    await second.write("image-to-video", { enabled: false });
    const config = await instance();
    expect(config.pricing?.markup?.perApp).toMatchObject({ "text-to-video": 2 });
    expect(config.capabilities?.block).toContain("image-to-video");
  });

  it("never writes the config the instance was deployed with, and reset goes back to exactly it", async () => {
    expect(readFileSync(file, "utf8")).toBe(deployed);
    expect(await capabilityOverrides()).toMatchObject({ saved: true, ignored: false, source: file });
    await (await store()).reset();
    expect(await capabilityOverrides()).toMatchObject({ saved: false });
    expect((await instance()).capabilities).toMatchObject({ block: ["*-experimental"], overrides: { music: { label: "Score" } } });
    expect((await instance()).pricing?.markup?.perApp).toBeUndefined();
    await resetSettings("capabilities");
    expect(readFileSync(file, "utf8")).toBe(deployed);
  });
});

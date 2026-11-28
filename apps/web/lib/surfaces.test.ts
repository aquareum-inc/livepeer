import { describe, expect, it } from "vitest";

import { homePath, surfacePathServed } from "./surfaces";

const all = { app: true, console: true, api: true, mcp: true };
const headless = { app: false, console: true, api: true, mcp: true };
const apiOnly = { app: false, console: false, api: true, mcp: true };

describe("surfaces", () => {
  it("serves everything with every surface on", () => {
    for (const path of ["/", "/studio", "/sign-in", "/auth/start", "/operator", "/operator/users", "/api/v1/offerings", "/api/mcp", "/api/health"]) {
      expect(surfacePathServed(path, all)).toBe(true);
    }
  });

  it("lets operators sign in to the console when there is no app", () => {
    expect(surfacePathServed("/sign-in", headless)).toBe(true);
    expect(surfacePathServed("/auth/callback", headless)).toBe(true);
    expect(surfacePathServed("/operator", headless)).toBe(true);
    expect(surfacePathServed("/studio", headless)).toBe(false);
    expect(homePath(headless)).toBe("/operator");
  });

  it("opens an invitation to the team wherever there is a console to join, app or no app", () => {
    expect(surfacePathServed("/join/operator/opi_abc", headless)).toBe(true);
    expect(surfacePathServed("/join/operator/opi_abc", all)).toBe(true);
    expect(surfacePathServed("/join/operator/opi_abc", apiOnly)).toBe(false);
    // A workspace's invitation belongs to the user app.
    expect(surfacePathServed("/join/wsp_token", headless)).toBe(false);
    // The page where the first owner claims the instance belongs to the console too.
    expect(surfacePathServed("/setup", headless)).toBe(true);
    expect(surfacePathServed("/setup", apiOnly)).toBe(false);
  });

  it("serves only the API and health check when that's all there is", () => {
    expect(surfacePathServed("/sign-in", apiOnly)).toBe(false);
    expect(surfacePathServed("/operator", apiOnly)).toBe(false);
    expect(surfacePathServed("/api/v1/offerings", apiOnly)).toBe(true);
    expect(surfacePathServed("/api/health", apiOnly)).toBe(true);
    expect(homePath(all)).toBe("/");
  });

  it("serves the console on phones its sign-in and API with only that surface on", () => {
    const consoleOnPhones = { app: false, console: false, api: false, mcp: false, mobileConsole: true };
    expect(surfacePathServed("/auth/start", consoleOnPhones)).toBe(true);
    expect(surfacePathServed("/auth/callback", consoleOnPhones)).toBe(true);
    expect(surfacePathServed("/api/v1/operator/status", consoleOnPhones)).toBe(true);
    expect(surfacePathServed("/operator", consoleOnPhones)).toBe(false);
    expect(surfacePathServed("/sign-in", consoleOnPhones)).toBe(false);
  });

  it("serves the apps their sign-in and API with only the mobile surface on", () => {
    const mobileOnly = { app: false, console: false, api: false, mcp: false, mobile: true };
    expect(surfacePathServed("/auth/start", mobileOnly)).toBe(true);
    expect(surfacePathServed("/auth/callback", mobileOnly)).toBe(true);
    expect(surfacePathServed("/api/v1/me", mobileOnly)).toBe(true);
    expect(surfacePathServed("/sign-in", mobileOnly)).toBe(false);
    expect(surfacePathServed("/api/mcp", mobileOnly)).toBe(false);
    expect(surfacePathServed("/api/v1/me", { ...apiOnly, api: false })).toBe(false);
  });
});

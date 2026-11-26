import { describe, expect, it } from "vitest";

import { FRESH_SECONDS, isFresh } from "./fresh";

const NOW = Date.parse("2026-11-25T09:00:00Z");

describe("a recent sign-in", () => {
  it("is one the provider timed within the last five minutes", () => {
    expect(isFresh(NOW / 1000, NOW)).toBe(true);
    expect(isFresh(NOW / 1000 - FRESH_SECONDS, NOW)).toBe(true);
    expect(isFresh(NOW / 1000 - FRESH_SECONDS - 1, NOW)).toBe(false);
  });

  it("is never one the provider didn't time", () => {
    expect(isFresh(null, NOW)).toBe(false);
    expect(isFresh(undefined, NOW)).toBe(false);
  });
});

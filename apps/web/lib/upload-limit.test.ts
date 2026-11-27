import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { uploadLimitBytes } from "./upload-limit";

describe("the host's upload limit", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is none unless the host declares one", () => {
    vi.stubEnv("UPLOAD_LIMIT_MB", "");
    expect(uploadLimitBytes()).toBeUndefined();
  });

  it("is read in megabytes", () => {
    vi.stubEnv("UPLOAD_LIMIT_MB", "4");
    expect(uploadLimitBytes()).toBe(4 * 1024 * 1024);
    vi.stubEnv("UPLOAD_LIMIT_MB", "4.5");
    expect(uploadLimitBytes()).toBe(4.5 * 1024 * 1024);
  });

  it("is none when the value isn't a size, so a slip can't refuse every file", () => {
    for (const value of ["0", "-4", "four", "4MB"]) {
      vi.stubEnv("UPLOAD_LIMIT_MB", value);
      expect(uploadLimitBytes()).toBeUndefined();
    }
  });
});

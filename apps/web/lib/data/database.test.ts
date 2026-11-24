import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { database, databaseStatus } from "./database";

afterEach(() => vi.unstubAllEnvs());

describe("the instance's database", () => {
  it("is none without DATABASE_URL, so development and tests need no database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(database()).toBeNull();
    expect(await databaseStatus()).toBe("none");
  });

  it("is one pool per address, reused between calls", () => {
    vi.stubEnv("DATABASE_URL", "postgres://livepeer:example@127.0.0.1:1/livepeer");
    expect(database()).toBe(database());
  });

  it("is unreachable, not an error, when nothing answers at the address", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://livepeer:example@127.0.0.1:1/livepeer");
    expect(await databaseStatus()).toBe("unreachable");
  });
});

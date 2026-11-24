import { defineConfig } from "vitest/config";

/** Each test starts a Postgres in process, which can take several seconds on a busy machine. */
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });

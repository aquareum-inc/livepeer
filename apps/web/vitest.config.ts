import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Tests import route handlers, which use the app's `@/` paths, as tsconfig.json maps them. The store tests
 * start a Postgres in process, which takes a second or two on a quiet machine and several on a busy one, so
 * tests and their set-up are given longer than the default five seconds.
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});

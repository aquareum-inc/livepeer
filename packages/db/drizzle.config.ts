import { defineConfig } from "drizzle-kit";

/** Only `generate` uses this: it compares the schema with the last snapshot and writes the next SQL file. */
export default defineConfig({ dialect: "postgresql", schema: "./src/schema.ts", out: "./migrations" });

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const template = (name: string) => JSON.parse(readFileSync(path.join(root, "deploy/templates/vercel", name), "utf8")) as { buildCommand: string; installCommand: string; framework: string; crons?: { path: string; schedule: string }[] };
const scripts = (file: string) => (JSON.parse(readFileSync(path.join(root, file), "utf8")) as { scripts: Record<string, string> }).scripts;

describe("the Vercel template", () => {
  const paid = template("vercel.json");
  const hobby = template("vercel.hobby.json");

  it("migrates the database before it builds, with scripts that exist", () => {
    for (const config of [paid, hobby]) {
      // Run from apps/web, the project's root directory: the migration is the workspace's script, the build the app's.
      expect(config.buildCommand).toBe("pnpm -w run db:migrate && pnpm run build");
      expect(config.framework).toBe("nextjs");
    }
    expect(scripts("package.json")["db:migrate"]).toBeDefined();
    expect(scripts("apps/web/package.json").build).toBe("next build");
  });

  it("has the alerts round called each minute, at a route the app has", () => {
    expect(paid.crons).toEqual([{ path: "/api/cron/alerts", schedule: "* * * * *" }]);
    expect(existsSync(path.join(root, "apps/web/app", `${paid.crons?.[0]?.path}/route.ts`))).toBe(true);
  });

  it("asks for no schedule on the Hobby plan, which refuses a deployment that has one more often than daily", () => {
    expect(hobby.crons).toBeUndefined();
    expect({ ...paid, crons: undefined }).toEqual({ ...hobby, crons: undefined });
  });
});

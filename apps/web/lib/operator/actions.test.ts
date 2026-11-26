import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every server action in the console says what it needs of the caller's role, where a reader can see it: a
 * call to `operatorApi("…")` or `requireOperator("…")` naming the change. The few that act only on the
 * caller's own place are listed here, so a new action can't be added without someone deciding.
 */
const OWN = ["revokeOperatorPhoneAction", "seeNewPhonesAction", "dismissNewPhonesAction"];

const source = readFileSync(path.join(import.meta.dirname, "actions.ts"), "utf8");
const actions = source.split(/\n(?=export async function )/).slice(1).map((body) => ({ name: /^export async function (\w+)/.exec(body)![1]!, body }));

describe("the console's server actions", () => {
  it("each name the change they make, so the caller's role is checked", () => {
    expect(actions.length).toBeGreaterThan(20);
    for (const { name, body } of actions) {
      if (OWN.includes(name)) continue;
      expect(body, name).toMatch(/(operatorApi|requireOperator)\((?!\))/);
      // No bare guard beside it that would hand back a client without the check.
      expect(body, name).not.toMatch(/operatorApi\(\)/);
    }
  });

  it("guard even the ones that act only on the caller's own place", () => {
    for (const { name, body } of actions.filter((action) => OWN.includes(action.name))) expect(body, name).toMatch(/requireOperator\(/);
  });
});

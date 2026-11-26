import { describe, expect, it } from "vitest";

import { OPERATOR_ROLES, OPERATOR_ROLE_COPY, operatorCan, type OperatorAction } from "./roles";

const ACTIONS: OperatorAction[] = ["suspend_account", "adjust_account", "retry_job", "resolve_report", "switch_capability", "block_compute", "set_pricing", "manage_grants", "manage_keys", "change_settings", "manage_team"];
const allowed = (role: (typeof OPERATOR_ROLES)[number]) => ACTIONS.filter((action) => operatorCan(role, action));

describe("what each operator role may do", () => {
  it("lets an owner do everything", () => {
    expect(allowed("owner")).toEqual(ACTIONS);
  });

  it("lets a member look after people and jobs, and nothing that decides what the instance is, charges or who runs it", () => {
    expect(allowed("member")).toEqual(["suspend_account", "adjust_account", "retry_job", "resolve_report", "switch_capability", "block_compute"]);
  });

  it("lets a viewer change nothing", () => {
    expect(allowed("viewer")).toEqual([]);
  });

  it("names every role", () => {
    expect(OPERATOR_ROLES.map((role) => OPERATOR_ROLE_COPY[role].name)).toEqual(["Owner", "Member", "Viewer"]);
  });
});

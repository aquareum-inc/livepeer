import { describe, expect, it } from "vitest";

import { can, canChangeRole, canLeave, canRemoveMember, type AccountAction } from "./workspaces";

const ACTIONS: AccountAction[] = ["spend", "view_all_usage", "manage_members", "manage_keys", "rename", "manage_billing", "transfer_ownership"];

describe("role rules", () => {
  it("the owner may do everything", () => {
    expect(ACTIONS.every((action) => can("owner", action))).toBe(true);
  });

  it("an admin handles people and keys, never money or ownership", () => {
    expect(ACTIONS.filter((action) => can("admin", action))).toEqual(["spend", "view_all_usage", "manage_members", "manage_keys", "rename"]);
  });

  it("a member makes things and nothing else", () => {
    expect(ACTIONS.filter((action) => can("member", action))).toEqual(["spend"]);
  });

  it("nobody removes or demotes the owner, and members remove nobody", () => {
    expect(canRemoveMember("owner", "admin")).toBe(true);
    expect(canRemoveMember("admin", "admin")).toBe(true);
    expect(canRemoveMember("admin", "owner")).toBe(false);
    expect(canRemoveMember("owner", "owner")).toBe(false);
    expect(canRemoveMember("member", "member")).toBe(false);
    expect(canChangeRole("admin", "member")).toBe(true);
    expect(canChangeRole("admin", "owner")).toBe(false);
    expect(canChangeRole("member", "member")).toBe(false);
  });

  it("everyone but the owner may leave", () => {
    expect([canLeave("owner"), canLeave("admin"), canLeave("member")]).toEqual([false, true, true]);
  });
});

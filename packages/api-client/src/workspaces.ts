import type { WorkspaceRole } from "./provider/types";

/**
 * What a person may do in an account, by their role in it (docs/workspaces.md §3). The owner handles money,
 * admins handle people and keys, members make things. A personal account's one person is its owner.
 * The API client refuses with these rules and the screens hide with them, so the two can't disagree.
 */
export type AccountAction =
  /** Make things and spend the account's credit. */
  | "spend"
  /** See what every member and key used, not only their own. */
  | "view_all_usage"
  /** Invite people, cancel invitations, remove members, change roles. */
  | "manage_members"
  /** Make and revoke API keys. */
  | "manage_keys"
  | "rename"
  /** Change the plan and buy credit. */
  | "manage_billing"
  | "transfer_ownership";

const ALLOWED: Record<WorkspaceRole, ReadonlySet<AccountAction>> = {
  owner: new Set(["spend", "view_all_usage", "manage_members", "manage_keys", "rename", "manage_billing", "transfer_ownership"]),
  admin: new Set(["spend", "view_all_usage", "manage_members", "manage_keys", "rename"]),
  member: new Set(["spend"]),
};

export function can(role: WorkspaceRole, action: AccountAction): boolean {
  return ALLOWED[role].has(action);
}

/** Whether someone may remove another member. Nobody removes the owner, and leaving is not removing. */
export function canRemoveMember(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  return can(actor, "manage_members") && target !== "owner";
}

/** Whether someone may move another member between admin and member. Ownership moves only by transfer. */
export function canChangeRole(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  return can(actor, "manage_members") && target !== "owner";
}

/** Anyone but the owner may leave; the owner transfers the workspace first. */
export function canLeave(role: WorkspaceRole): boolean {
  return role !== "owner";
}

/** The roles a person can be invited with or changed to. */
export const ASSIGNABLE_ROLES = ["admin", "member"] as const satisfies ReadonlyArray<Exclude<WorkspaceRole, "owner">>;

/** A request the caller's role in the account doesn't allow. */
export class NotAllowed extends Error {
  constructor(message = "Your role in this workspace doesn't allow that.") {
    super(message);
    this.name = "NotAllowed";
  }
}

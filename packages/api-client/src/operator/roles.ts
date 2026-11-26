import type { OperatorRole } from "../types";

/**
 * Something in the console that changes the instance. Reading is not here: every operator reads everything.
 * Neither is what a person does to their own place: their own phone, their own alerts, leaving the team.
 */
export type OperatorAction =
  /** Suspend or resume a user or a workspace. */
  | "suspend_account"
  /** Top up a user or a workspace, assign a plan, refund a payment. */
  | "adjust_account"
  | "retry_job"
  /** Keep up or take down a reported character. */
  | "resolve_report"
  /** Switch a capability on or off. */
  | "switch_capability"
  | "block_compute"
  /** Markup and where a capability appears, plans, credit packs, the top-up range, billing settings. */
  | "set_pricing"
  | "manage_grants"
  /** Issue and revoke API and access keys. */
  | "manage_keys"
  /** Instance settings, surfaces, appearance, sign-up. */
  | "change_settings"
  /** Invite, add, change a role, remove, and revoke someone else's phone. */
  | "manage_team";

/** Highest first. */
export const OPERATOR_ROLES = ["owner", "member", "viewer"] as const satisfies readonly OperatorRole[];

const MEMBER: readonly OperatorAction[] = ["suspend_account", "adjust_account", "retry_job", "resolve_report", "switch_capability", "block_compute"];

/**
 * Owners decide what the instance is, what it charges and who runs it. Members look after people and jobs.
 * Viewers read. The server refuses with this and the screens hide with it.
 */
export function operatorCan(role: OperatorRole, action: OperatorAction): boolean {
  return role === "owner" || (role === "member" && MEMBER.includes(action));
}

/** A role's name and what it may do, in the words the console uses wherever a role is chosen or shown. */
export const OPERATOR_ROLE_COPY: Record<OperatorRole, { name: string; can: string }> = {
  owner: { name: "Owner", can: "Everything, including pricing, keys, settings and the team." },
  member: { name: "Member", can: "Looks after people and jobs: suspend, top up, refund, retry, decide reports, switch a capability off." },
  viewer: { name: "Viewer", can: "Sees everything and changes nothing." },
};

/** A change the caller's role on the team doesn't allow. */
export class OperatorRoleRefused extends Error {
  constructor(message = "Your role on this team doesn't allow that. An owner can do it, or change your role.") {
    super(message);
    this.name = "OperatorRoleRefused";
  }
}

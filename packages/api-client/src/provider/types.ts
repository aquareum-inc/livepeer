/**
 * The payment and identity provider behind the engine, in the engine's terms: grants fund
 * allocations, an allocation is a user's budget, usage is what was spent, a plan is the
 * provider's plan. Nothing here is a second ledger: every amount is read from the provider.
 */

export interface Money {
  /** Decimal string, as the engine and providers report amounts. */
  amount: string;
  currency: string;
}

export interface ProviderUser {
  id: string;
  name: string;
  email: string | null;
  role: "user" | "operator";
  status: "active" | "paused" | "revoked";
  created_at: string;
}

export interface Grant {
  id: string;
  label: string;
  funded: Money;
  allocated: Money;
  spent: Money;
  created_at: string;
}

export interface Allocation {
  id: string;
  grant_id: string;
  /** The account the budget belongs to: a person, or a workspace. */
  user_id: string;
  status: "active" | "paused" | "revoked";
  granted: Money;
  spent: Money;
  available: Money;
}

export interface PlanAllowance {
  /** Credits included each period. */
  credits: number;
  period: "month" | "year";
  /** Months unused credits carry forward; 0 means they expire. */
  rollover_months: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: Money;
  interval: "month" | "year";
  allowance: PlanAllowance;
  features: string[];
  /** Multiplier on wholesale cost for subscribers; null uses the instance default. */
  markup: number | null;
  active: boolean;
}

/** A one-off top-up the provider sells at a fixed price. Buying one adds to the user's allocation. */
export interface CreditPack {
  id: string;
  credits: number;
  price: Money;
  /** Shown first and marked to users. At most one pack is. */
  popular: boolean;
  /** Offered to users. Packs are withdrawn rather than deleted, so past purchases still name them. */
  active: boolean;
}

/**
 * Top-ups of an amount the user chooses, beside the fixed packs. The operator switches them on and
 * sets the limits; card processors have minimum charges, and fees make very small top-ups a loss.
 */
export interface TopUpRange {
  enabled: boolean;
  min: Money;
  max: Money;
}

export interface UsageEntry {
  id: string;
  /** The account that was charged: a person, or a workspace. */
  user_id: string;
  /** The person who ran it. On a personal account that is the account's own id; null when an API key ran it. */
  member_id: string | null;
  /** The API key that ran it, or null when a person did. */
  key_id: string | null;
  app: string;
  /** What the network charged. */
  wholesale: Money;
  /** What the user was charged, in credits. */
  credits: number;
  status: "delivered" | "failed_after_payment" | "pending";
  created_at: string;
}

export interface UsageSummary {
  credits: number;
  wholesale: Money;
  jobs: number;
  by_app: Array<{ app: string; credits: number; jobs: number }>;
}

export type WorkspaceRole = "owner" | "admin" | "member";

/**
 * A shared account several people belong to. Its id is an account id: it has an allocation, a plan and
 * usage exactly as a person's id does, so `budgets`, `plans` and `usage` take it unchanged.
 */
export interface Workspace {
  id: string;
  name: string;
  /** Paused by the operator: nobody can spend from it. Its members' own accounts are untouched. */
  status: "active" | "paused";
  owner_id: string;
  member_count: number;
  created_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  name: string;
  email: string | null;
  role: WorkspaceRole;
  joined_at: string;
}

/** One of a person's memberships. */
export interface WorkspaceMembership {
  workspace: Workspace;
  role: WorkspaceRole;
}

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  workspace_name: string;
  email: string;
  /** The role the person joins with. Ownership is transferred, never invited. */
  role: Exclude<WorkspaceRole, "owner">;
  /** The inviting member's id and name. */
  invited_by: string;
  invited_by_name: string;
  /** What the invitation link carries. Whoever holds it can answer the invitation. */
  token: string;
  created_at: string;
  expires_at: string;
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
}

/** What one member, or one API key, has used of a workspace's credit. Exactly one of the two ids is set. */
export interface MemberUsage {
  member_id: string | null;
  key_id: string | null;
  credits: number;
  jobs: number;
  last_used_at: string | null;
}

/** What the connected provider can do, so the UI can say so instead of failing. */
export interface ProviderFeatures {
  users: boolean;
  grants: boolean;
  plans: boolean;
  allowances: boolean;
  credit_packs: boolean;
  /** Top-ups of an amount the user chooses. */
  custom_top_up: boolean;
  invoices: boolean;
  oidc: boolean;
  /** Shared accounts with members and roles. */
  workspaces: boolean;
}

export class UnsupportedByProvider extends Error {
  constructor(provider: string, operation: string) {
    super(`${provider} does not support ${operation}`);
    this.name = "UnsupportedByProvider";
  }
}

export interface PaymentProvider {
  readonly id: "mock" | "batteries" | "pymthouse";
  readonly name: string;
  readonly features: ProviderFeatures;

  identity: {
    listUsers(): Promise<ProviderUser[]>;
    getUser(id: string): Promise<ProviderUser | null>;
    setUserStatus(id: string, status: ProviderUser["status"]): Promise<ProviderUser>;
    setUserRole(id: string, role: ProviderUser["role"]): Promise<ProviderUser>;
    /** Deletes a user and closes their allocation, on their own request. App stores require it (engine question Q14). */
    deleteUser(id: string): Promise<void>;
  };

  budgets: {
    listGrants(): Promise<Grant[]>;
    createGrant(input: { label: string; amount: Money }): Promise<Grant>;
    fundGrant(id: string, amount: Money): Promise<Grant>;
    /** `accountId` here and below is a person's id or a workspace's: whichever account owns the budget. */
    getAllocation(accountId: string): Promise<Allocation | null>;
    provisionAllocation(input: { userId: string; grantId: string; amount: Money }): Promise<Allocation>;
    /** A one-off addition to an account's allocation. A credit pack is this. */
    topUpAllocation(accountId: string, amount: Money): Promise<Allocation>;
  };

  plans: {
    listPlans(): Promise<Plan[]>;
    createPlan(input: Omit<Plan, "id">): Promise<Plan>;
    updatePlan(id: string, patch: Partial<Omit<Plan, "id">>): Promise<Plan>;
    /** The plan of an account: a person's, or a workspace's. */
    getUserPlan(accountId: string): Promise<Plan | null>;
    assignPlan(accountId: string, planId: string | null): Promise<Plan | null>;
    /** Every pack, offered or not, cheapest first. */
    listCreditPacks(): Promise<CreditPack[]>;
    createCreditPack(input: Omit<CreditPack, "id">): Promise<CreditPack>;
    updateCreditPack(id: string, patch: Partial<Omit<CreditPack, "id">>): Promise<CreditPack>;
    getTopUpRange(): Promise<TopUpRange>;
    updateTopUpRange(patch: Partial<TopUpRange>): Promise<TopUpRange>;
  };

  usage: {
    /** `userId` is the account charged; `memberId` narrows a workspace's usage to one person's. */
    listUsage(filter: { userId?: string; memberId?: string; limit?: number }): Promise<UsageEntry[]>;
    getUsageSummary(filter: { userId?: string; memberId?: string }): Promise<UsageSummary>;
    /** A workspace's usage by who caused it: one row per member and per API key, most used first. */
    getUsageByMember(accountId: string): Promise<MemberUsage[]>;
  };

  /**
   * Shared accounts, in the shape PymtHouse is expected to expose (docs/workspaces.md; questions Q18 to Q24).
   * The provider holds membership and invitations, so the app stores neither. It keeps the invariants: one
   * owner, who can't be removed or demoted; who may ask for what is the app's rule (`can` in workspaces.ts).
   */
  workspaces: {
    /** Every workspace, for the operator. */
    list(): Promise<Workspace[]>;
    listForUser(userId: string): Promise<WorkspaceMembership[]>;
    get(id: string): Promise<Workspace | null>;
    /** Opens a workspace with the owner as its only member and an empty allocation. */
    create(input: { name: string; ownerId: string }): Promise<Workspace>;
    rename(id: string, name: string): Promise<Workspace>;
    /** Pausing a workspace pauses its allocation. */
    setStatus(id: string, status: Workspace["status"]): Promise<Workspace>;
    listMembers(id: string): Promise<WorkspaceMember[]>;
    setMemberRole(id: string, userId: string, role: Exclude<WorkspaceRole, "owner">): Promise<WorkspaceMember>;
    /** Also how a member leaves. */
    removeMember(id: string, userId: string): Promise<void>;
    /** The new owner must already be a member; the old owner becomes an admin. */
    transferOwnership(id: string, toUserId: string): Promise<Workspace>;
    /** Invitations still waiting for an answer. */
    listInvitations(id: string): Promise<WorkspaceInvitation[]>;
    /** Invitations waiting for the person, matched on their email. */
    listInvitationsForUser(userId: string): Promise<WorkspaceInvitation[]>;
    getInvitation(token: string): Promise<WorkspaceInvitation | null>;
    /** Inviting an address that already has an invitation waiting renews it: this is also "resend". */
    invite(id: string, input: { email: string; role: Exclude<WorkspaceRole, "owner">; invitedBy: string }): Promise<WorkspaceInvitation>;
    revokeInvitation(invitationId: string): Promise<void>;
    acceptInvitation(token: string, userId: string): Promise<WorkspaceMembership>;
    declineInvitation(token: string): Promise<void>;
  };
}

export interface MarkupRule {
  creditsPerUsd: number;
  default: number;
  perApp?: Record<string, number>;
}

/** A retail price: wholesale cost in USD, marked up, converted to credits and rounded up. */
export function creditsFor(wholesaleUsd: number, app: string, rule: MarkupRule): number {
  const markup = rule.perApp?.[app] ?? rule.default;
  return Math.ceil(wholesaleUsd * markup * rule.creditsPerUsd - 1e-9);
}

/**
 * Credits for a top-up of the user's own amount: the rate of the largest pack it reaches, so an
 * amount between packs never beats buying the packs, and the base rate below the smallest pack.
 */
export function topUpCredits(amountUsd: number, packs: ReadonlyArray<CreditPack>, creditsPerUsd: number): number {
  const reached = packs
    .filter((pack) => pack.active && Number(pack.price.amount) > 0 && Number(pack.price.amount) <= amountUsd)
    .sort((a, b) => Number(b.price.amount) - Number(a.price.amount))[0];
  const rate = reached ? reached.credits / Number(reached.price.amount) : creditsPerUsd;
  return Math.floor(amountUsd * rate + 1e-9);
}

/** A user's credit balance is their allocation's available amount, at the instance's rate. */
export function balanceInCredits(allocation: Pick<Allocation, "available">, rule: MarkupRule): number {
  return Math.max(0, Math.floor(Number(allocation.available.amount) * rule.creditsPerUsd + 1e-9));
}

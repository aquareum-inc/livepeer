import type { EngineConfig } from "../live/engine";
import { EngineError } from "../live/engine";
import type { Allowance } from "../types";
import {
  UnsupportedByProvider,
  type Allocation,
  type Grant,
  type Money,
  type PaymentProvider,
} from "./types";

/** `GrantRecord` as the engine returns it. Allocated and spent totals are not part of it. */
interface EngineGrant {
  id: string;
  name: string;
  status: string;
  currency: string;
  total: string;
  metadata: Record<string, string>;
}

/**
 * Clearinghouse Batteries, reached through the engine. It is a budget ledger: grants and
 * allocations are live; it has no users, plans, credit packs or invoices, and says so.
 * `reader` is the auditor token for reads; `admin` is used only for writes.
 */
export function createBatteriesProvider(engine: { url: string; reader?: string; admin?: string; applicationId?: string }): PaymentProvider {
  const unsupported = (operation: string) => async (): Promise<never> => {
    throw new UnsupportedByProvider("Clearinghouse Batteries", operation);
  };
  const call = async <T>(method: "GET" | "POST", path: string, token: string | undefined, body?: unknown): Promise<T> => {
    const config: EngineConfig = { url: engine.url, ...(token ? { token } : {}) };
    const response = await fetch(new URL(path, config.url), {
      method,
      headers: { ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new EngineError(response.status, `Engine answered ${response.status} for ${method} ${path}`);
    return (await response.json()) as T;
  };
  const zero = (currency: string): Money => ({ amount: "0", currency });
  const toGrant = (grant: EngineGrant): Grant => ({
    id: grant.id,
    label: grant.name,
    funded: { amount: grant.total, currency: grant.currency },
    // The engine's grant record carries the total only; per-grant allocated and spent need the provider.
    allocated: zero(grant.currency),
    spent: zero(grant.currency),
    created_at: grant.metadata.created_at ?? "",
  });
  const statusOf = (value: string): Allocation["status"] => (value === "paused" || value === "revoked" ? value : "active");
  const allocationPath = (userId: string) =>
    `/v1/admin/applications/${encodeURIComponent(engine.applicationId ?? "default")}/actors/${encodeURIComponent(userId)}/allocation`;
  const input = (amount: Money) => ({ amount: amount.amount, currency: amount.currency });
  const readAllocation = async (userId: string): Promise<Allocation | null> => {
    try {
      const allowance = await call<Allowance>("GET", `/v1/allowance?actor_id=${encodeURIComponent(userId)}`, engine.reader);
      const currency = allowance.available?.currency ?? allowance.granted?.currency ?? "USD";
      return {
        id: allowance.allocation_id,
        grant_id: "",
        user_id: userId,
        status: statusOf(allowance.status),
        granted: allowance.granted ?? zero(currency),
        spent: allowance.spent ?? zero(currency),
        available: allowance.available ?? zero(currency),
      };
    } catch (error) {
      if (error instanceof EngineError && error.status === 404) return null;
      throw error;
    }
  };

  return {
    id: "batteries",
    name: "Clearinghouse Batteries",
    features: { users: false, grants: true, plans: false, allowances: false, credit_packs: false, custom_top_up: false, invoices: false, oidc: false, workspaces: false },

    identity: {
      listUsers: unsupported("listing users"),
      getUser: unsupported("reading a user"),
      setUserStatus: unsupported("changing a user's status"),
      setUserRole: unsupported("roles"),
      deleteUser: unsupported("deleting a user (engine question Q14)"),
    },

    budgets: {
      async listGrants() {
        return (await call<EngineGrant[]>("GET", "/v1/admin/grants", engine.admin)).map(toGrant);
      },
      async createGrant({ label, amount }) {
        return toGrant(await call<EngineGrant>("POST", "/v1/admin/grants", engine.admin, { name: label, amount: input(amount), operation_ref: crypto.randomUUID() }));
      },
      async fundGrant(id, amount) {
        return toGrant(await call<EngineGrant>("POST", "/v1/admin/grant/fund", engine.admin, { grant_id: id, amount: input(amount), operation_ref: crypto.randomUUID() }));
      },
      getAllocation: readAllocation,
      async provisionAllocation({ userId, grantId, amount }) {
        await call("POST", allocationPath(userId), engine.admin, { grant_id: grantId, amount: input(amount), operation_ref: crypto.randomUUID() });
        return (await readAllocation(userId)) as Allocation;
      },
      async topUpAllocation(userId, amount) {
        await call("POST", `${allocationPath(userId)}/fund`, engine.admin, { amount: input(amount), operation_ref: crypto.randomUUID() });
        return (await readAllocation(userId)) as Allocation;
      },
    },

    plans: {
      async listPlans() {
        return [];
      },
      createPlan: unsupported("plans"),
      updatePlan: unsupported("plans"),
      async getUserPlan() {
        return null;
      },
      assignPlan: unsupported("plans"),
      async listCreditPacks() {
        return [];
      },
      createCreditPack: unsupported("credit packs"),
      updateCreditPack: unsupported("credit packs"),
      async getTopUpRange() {
        return { enabled: false, min: zero("USD"), max: zero("USD") };
      },
      updateTopUpRange: unsupported("top-ups of the user's own amount"),
    },

    usage: {
      listUsage: unsupported("per-user usage (read job costs from the engine instead)"),
      getUsageSummary: unsupported("usage summaries (read /v1/costs/summary from the engine instead)"),
      getUsageByMember: unsupported("usage by member"),
    },

    // Batteries has no users, so nobody to belong to anything. Reads answer "none" so a screen can ask.
    workspaces: {
      async list() {
        return [];
      },
      async listForUser() {
        return [];
      },
      async get() {
        return null;
      },
      create: unsupported("workspaces"),
      rename: unsupported("workspaces"),
      setStatus: unsupported("workspaces"),
      async listMembers() {
        return [];
      },
      setMemberRole: unsupported("workspaces"),
      removeMember: unsupported("workspaces"),
      transferOwnership: unsupported("workspaces"),
      async listInvitations() {
        return [];
      },
      async listInvitationsForUser() {
        return [];
      },
      async getInvitation() {
        return null;
      },
      invite: unsupported("workspaces"),
      revokeInvitation: unsupported("workspaces"),
      acceptInvitation: unsupported("workspaces"),
      declineInvitation: unsupported("workspaces"),
    },
  };
}

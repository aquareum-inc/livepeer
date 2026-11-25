import type {
  Allocation,
  CreditPack,
  TopUpRange,
  Grant,
  MemberUsage,
  Money,
  PaymentProvider,
  Plan,
  ProviderUser,
  UsageEntry,
  UsageSummary,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
} from "./types";

const usd = (amount: number): Money => ({ amount: amount.toFixed(2), currency: "USD" });
const num = (money: Money) => Number(money.amount);

interface State {
  users: ProviderUser[];
  grants: Grant[];
  allocations: Allocation[];
  plans: Plan[];
  packs: CreditPack[];
  topUp: TopUpRange;
  assignments: Map<string, string>;
  usage: UsageEntry[];
  workspaces: Array<Omit<Workspace, "member_count">>;
  members: Array<Pick<WorkspaceMember, "workspace_id" | "user_id" | "role" | "joined_at">>;
  invitations: WorkspaceInvitation[];
  sequence: number;
}

/** How long an invitation can be answered. */
const INVITATION_DAYS = 7;
const DAY_MS = 86_400_000;

const APPS = ["text-to-video", "image-to-video", "text-to-image", "music", "chat", "video-understanding"];

function seed(): State {
  const users: ProviderUser[] = [
    { id: "usr_demo_adam", name: "Adam Soffer", email: "adam@example.test", role: "user", status: "active", created_at: "2026-09-02T10:14:00Z" },
    { id: "usr_demo_sam", name: "Sam Whitfield", email: "sam@example.test", role: "operator", status: "active", created_at: "2026-08-19T08:40:00Z" },
    { id: "usr_demo_ines", name: "Inés Castellanos", email: "ines@example.test", role: "user", status: "active", created_at: "2026-10-11T16:22:00Z" },
    { id: "usr_demo_tomas", name: "Tomás Lindqvist", email: "tomas@example.test", role: "user", status: "paused", created_at: "2026-10-28T09:05:00Z" },
    { id: "usr_demo_priya", name: "Priya Raman", email: "priya@example.test", role: "user", status: "active", created_at: "2026-11-05T13:47:00Z" },
  ];
  const grants: Grant[] = [
    { id: "grt_launch", label: "Launch credits", funded: usd(500), allocated: usd(210), spent: usd(64.18), created_at: "2026-08-19T08:45:00Z" },
    { id: "grt_studio_partners", label: "Studio partners", funded: usd(1200), allocated: usd(400), spent: usd(212.4), created_at: "2026-10-01T12:00:00Z" },
  ];
  const budget: Array<[string, string, number, number, Allocation["status"]]> = [
    ["usr_demo_adam", "grt_launch", 50, 25.2, "active"],
    ["usr_demo_sam", "grt_launch", 100, 12.6, "active"],
    ["usr_demo_ines", "grt_studio_partners", 250, 141.9, "active"],
    ["usr_demo_tomas", "grt_launch", 60, 26.38, "paused"],
    ["usr_demo_priya", "grt_studio_partners", 150, 70.5, "active"],
    ["wsp_northlight", "grt_studio_partners", 600, 233.4, "active"],
    ["wsp_harbour", "grt_launch", 120, 18.75, "active"],
  ];
  const allocations = budget.map(([user_id, grant_id, granted, spent, status]) => ({
    id: `alc_${user_id.replace(/^(usr_demo|wsp)_/, "")}`,
    grant_id,
    user_id,
    status,
    granted: usd(granted),
    spent: usd(spent),
    available: usd(granted - spent),
  }));
  const plans: Plan[] = [
    { id: "pln_creator", name: "Creator", description: "For people making video every week.", price: usd(18), interval: "month", allowance: { credits: 2000, period: "month", rollover_months: 0 }, features: ["Every capability on the network", "API and MCP access"], markup: null, active: true },
    { id: "pln_studio", name: "Studio", description: "For teams and heavier production.", price: usd(68), interval: "month", allowance: { credits: 9000, period: "month", rollover_months: 2 }, features: ["Unused credits roll over for 2 months", "Priority in the queue", "Live mode destinations"], markup: 1.2, active: true },
    { id: "pln_network", name: "Network", description: "For agents and products built on the API.", price: usd(200), interval: "month", allowance: { credits: 30000, period: "month", rollover_months: 3 }, features: ["Unused credits roll over for 3 months", "Lowest markup on network cost", "Higher API rate limits"], markup: 1.1, active: true },
  ];
  const usage: UsageEntry[] = Array.from({ length: 42 }, (_, index) => {
    const user = users[index % users.length] as ProviderUser;
    const app = APPS[(index * 5) % APPS.length] as string;
    const wholesale = app.includes("video") && !app.includes("understanding") ? 0.4 + (index % 3) * 0.1 : app === "music" ? 0.05 : 0.01;
    return {
      id: `use_${(1000 + index).toString(36)}`,
      user_id: user.id,
      member_id: user.id,
      key_id: null,
      app,
      wholesale: { amount: wholesale.toFixed(4), currency: "USD" },
      credits: Math.ceil(wholesale * 1.3 * 100),
      status: index % 11 === 7 ? "failed_after_payment" : index < 2 ? "pending" : "delivered",
      created_at: new Date(Date.UTC(2026, 10, 17, 20) - index * 5.3 * 3600_000).toISOString(),
    };
  });
  const workspaces: State["workspaces"] = [
    { id: "wsp_northlight", name: "Northlight Studio", status: "active", owner_id: "usr_demo_ines", created_at: "2026-10-14T09:30:00Z" },
    { id: "wsp_harbour", name: "Harbour Films", status: "active", owner_id: "usr_demo_sam", created_at: "2026-11-02T15:10:00Z" },
  ];
  const members: State["members"] = [
    { workspace_id: "wsp_northlight", user_id: "usr_demo_ines", role: "owner", joined_at: "2026-10-14T09:30:00Z" },
    { workspace_id: "wsp_northlight", user_id: "usr_demo_adam", role: "admin", joined_at: "2026-10-15T11:02:00Z" },
    { workspace_id: "wsp_northlight", user_id: "usr_demo_priya", role: "member", joined_at: "2026-11-06T08:20:00Z" },
    { workspace_id: "wsp_northlight", user_id: "usr_demo_tomas", role: "member", joined_at: "2026-10-29T14:45:00Z" },
    { workspace_id: "wsp_harbour", user_id: "usr_demo_sam", role: "owner", joined_at: "2026-11-02T15:10:00Z" },
    { workspace_id: "wsp_harbour", user_id: "usr_demo_priya", role: "member", joined_at: "2026-11-03T10:00:00Z" },
  ];
  // Invitations are dated from start-up, so the seeded ones are always still open.
  const now = Date.now();
  const invitation = (id: string, workspace: string, email: string, role: WorkspaceInvitation["role"], by: string, daysAgo: number): WorkspaceInvitation => ({
    id,
    workspace_id: workspace,
    workspace_name: workspaces.find((entry) => entry.id === workspace)?.name ?? "",
    email,
    role,
    invited_by: by,
    invited_by_name: users.find((entry) => entry.id === by)?.name ?? "",
    token: `${id.replace("inv_", "join_")}_demo`,
    created_at: new Date(now - daysAgo * DAY_MS).toISOString(),
    expires_at: new Date(now + (INVITATION_DAYS - daysAgo) * DAY_MS).toISOString(),
    status: "pending",
  });
  const invitations = [
    invitation("inv_lena", "wsp_northlight", "lena@example.test", "member", "usr_demo_ines", 2),
    invitation("inv_adam", "wsp_harbour", "adam@example.test", "member", "usr_demo_sam", 1),
  ];
  // What Northlight's people and its one API key spent from the shared allocation.
  const northlight: Array<[member: string | null, key: string | null]> = [
    ["usr_demo_ines", null], ["usr_demo_adam", null], ["usr_demo_priya", null], ["usr_demo_ines", null], [null, "key_northlight_render"], ["usr_demo_adam", null], ["usr_demo_tomas", null],
  ];
  const shared: UsageEntry[] = Array.from({ length: 36 }, (_, index) => {
    const [member_id, key_id] = northlight[index % northlight.length] as [string | null, string | null];
    const app = APPS[(index * 7 + 1) % APPS.length] as string;
    const wholesale = app.includes("video") && !app.includes("understanding") ? 0.45 + (index % 4) * 0.1 : app === "music" ? 0.05 : 0.01;
    return {
      id: `use_${(2000 + index).toString(36)}`,
      user_id: "wsp_northlight",
      member_id,
      key_id,
      app,
      wholesale: { amount: wholesale.toFixed(4), currency: "USD" },
      credits: Math.ceil(wholesale * 1.2 * 100),
      status: index % 13 === 9 ? "failed_after_payment" : "delivered",
      created_at: new Date(Date.UTC(2026, 10, 22, 17) - index * 4.1 * 3600_000).toISOString(),
    };
  });
  usage.push(...shared);
  usage.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { workspaces, members, invitations, users, grants, allocations, plans, packs: PACKS.map((pack) => ({ ...pack })), topUp: { enabled: true, min: usd(5), max: usd(500) }, assignments: new Map([["usr_demo_ines", "pln_studio"], ["usr_demo_priya", "pln_creator"], ["wsp_northlight", "pln_studio"]]), usage, sequence: 0 };
}

const PACKS: CreditPack[] = [
  { id: "pck_usd10", credits: 1000, price: usd(10), popular: false, active: true },
  { id: "pck_usd25", credits: 2500, price: usd(25), popular: true, active: true },
  { id: "pck_usd50", credits: 5250, price: usd(50), popular: false, active: true },
  { id: "pck_usd100", credits: 11000, price: usd(100), popular: false, active: true },
];

/** What any provider would refuse: a pack has to give whole credits for a price. */
function checkPack(pack: Omit<CreditPack, "id">): void {
  if (!Number.isInteger(pack.credits) || pack.credits <= 0) throw new Error("A pack has to give a whole number of credits, more than zero.");
  if (!(num(pack.price) > 0)) throw new Error("A pack's price has to be more than zero.");
}

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} not found`);
  return value;
}

/**
 * A complete provider in the shape PymtHouse exposes (users, plans with allowances and markup,
 * usage), so plans and sign-in switch to real data when that provider is connected.
 */
export function createMockProvider(): PaymentProvider {
  const state = seed();
  const id = (prefix: string) => `${prefix}_${(++state.sequence + 4096).toString(36)}`;
  const allocationOf = (userId: string) => state.allocations.find((entry) => entry.user_id === userId);
  const usageOf = (filter: { userId?: string; memberId?: string }) =>
    state.usage.filter((entry) => (!filter.userId || entry.user_id === filter.userId) && (!filter.memberId || entry.member_id === filter.memberId));

  const membersOf = (workspaceId: string) => state.members.filter((entry) => entry.workspace_id === workspaceId);
  const toWorkspace = (workspace: State["workspaces"][number]): Workspace => ({ ...workspace, member_count: membersOf(workspace.id).length });
  const workspaceOf = (workspaceId: string) => must(state.workspaces.find((entry) => entry.id === workspaceId), "workspace");
  const memberOf = (workspaceId: string, userId: string) => must(membersOf(workspaceId).find((entry) => entry.user_id === userId), "member");
  const toMember = (member: State["members"][number]): WorkspaceMember => {
    const user = state.users.find((entry) => entry.id === member.user_id);
    return { ...member, name: user?.name ?? "Former user", email: user?.email ?? null };
  };
  const ROLE_ORDER: Record<WorkspaceRole, number> = { owner: 0, admin: 1, member: 2 };
  /** An invitation as it stands now: one past its date reads as expired. */
  const current = (invitation: WorkspaceInvitation): WorkspaceInvitation =>
    invitation.status === "pending" && Date.parse(invitation.expires_at) <= Date.now() ? { ...invitation, status: "expired" } : { ...invitation };
  const openInvitation = (token: string) => {
    const invitation = state.invitations.find((entry) => entry.token === token);
    if (!invitation || current(invitation).status !== "pending") throw new Error("That invitation is no longer open.");
    return invitation;
  };
  const cleanName = (name: string) => {
    const value = name.trim().replace(/\s+/g, " ");
    if (value.length < 2 || value.length > 48) throw new Error("A workspace's name has 2 to 48 characters.");
    return value;
  };

  return {
    id: "mock",
    name: "Built-in mock provider",
    features: { users: true, grants: true, plans: true, allowances: true, credit_packs: true, custom_top_up: true, invoices: true, oidc: true, workspaces: true },

    identity: {
      async listUsers() {
        return state.users.map((user) => ({ ...user }));
      },
      async getUser(userId) {
        const user = state.users.find((entry) => entry.id === userId);
        return user ? { ...user } : null;
      },
      async setUserStatus(userId, status) {
        const user = must(state.users.find((entry) => entry.id === userId), "user");
        user.status = status;
        const allocation = allocationOf(userId);
        if (allocation) allocation.status = status;
        return { ...user };
      },
      async setUserRole(userId, role) {
        const user = must(state.users.find((entry) => entry.id === userId), "user");
        user.role = role;
        return { ...user };
      },
      async deleteUser(userId) {
        // A workspace can't be left without its owner, so an owner has to hand it on first.
        if (state.workspaces.some((entry) => entry.owner_id === userId)) throw new Error("Transfer the workspaces this person owns first.");
        state.users = state.users.filter((entry) => entry.id !== userId);
        state.allocations = state.allocations.filter((entry) => entry.user_id !== userId);
        state.assignments.delete(userId);
        state.members = state.members.filter((entry) => entry.user_id !== userId);
      },
    },

    budgets: {
      async listGrants() {
        return state.grants.map((grant) => ({ ...grant }));
      },
      async createGrant({ label, amount }) {
        const grant: Grant = { id: id("grt"), label, funded: amount, allocated: usd(0), spent: usd(0), created_at: new Date().toISOString() };
        state.grants.push(grant);
        return { ...grant };
      },
      async fundGrant(grantId, amount) {
        const grant = must(state.grants.find((entry) => entry.id === grantId), "grant");
        grant.funded = usd(num(grant.funded) + num(amount));
        return { ...grant };
      },
      async getAllocation(userId) {
        const allocation = allocationOf(userId);
        return allocation ? { ...allocation } : null;
      },
      async provisionAllocation({ userId, grantId, amount }) {
        const resolvedGrantId = grantId ?? state.grants[0]?.id ?? "";
        const grant = must(state.grants.find((entry) => entry.id === resolvedGrantId), "grant");
        if (num(grant.funded) - num(grant.allocated) < num(amount)) throw new Error("The grant has less unallocated funding than that.");
        grant.allocated = usd(num(grant.allocated) + num(amount));
        const allocation: Allocation = { id: id("alc"), grant_id: resolvedGrantId, user_id: userId, status: "active", granted: amount, spent: usd(0), available: amount };
        state.allocations = state.allocations.filter((entry) => entry.user_id !== userId).concat(allocation);
        return { ...allocation };
      },
      async topUpAllocation(userId, amount) {
        const allocation = must(allocationOf(userId), "allocation");
        allocation.granted = usd(num(allocation.granted) + num(amount));
        allocation.available = usd(num(allocation.available) + num(amount));
        return { ...allocation };
      },
    },

    plans: {
      async listPlans() {
        return state.plans.map((plan) => ({ ...plan }));
      },
      async createPlan(input) {
        const plan: Plan = { ...input, id: id("pln") };
        state.plans.push(plan);
        return { ...plan };
      },
      async updatePlan(planId, patch) {
        const plan = must(state.plans.find((entry) => entry.id === planId), "plan");
        Object.assign(plan, patch);
        return { ...plan };
      },
      async getUserPlan(userId) {
        const plan = state.plans.find((entry) => entry.id === state.assignments.get(userId));
        return plan ? { ...plan } : null;
      },
      async assignPlan(userId, planId) {
        if (planId === null) {
          state.assignments.delete(userId);
          return null;
        }
        const plan = must(state.plans.find((entry) => entry.id === planId), "plan");
        state.assignments.set(userId, planId);
        return { ...plan };
      },
      async listCreditPacks() {
        return state.packs.map((pack) => ({ ...pack })).sort((a, b) => num(a.price) - num(b.price));
      },
      async createCreditPack(input) {
        checkPack(input);
        const pack: CreditPack = { ...input, id: id("pck") };
        if (pack.popular) for (const other of state.packs) other.popular = false;
        state.packs.push(pack);
        return { ...pack };
      },
      async updateCreditPack(packId, patch) {
        const pack = must(state.packs.find((entry) => entry.id === packId), "credit pack");
        const next = { ...pack, ...patch };
        checkPack(next);
        if (next.popular) for (const other of state.packs) other.popular = false;
        Object.assign(pack, next);
        return { ...pack };
      },
      async getTopUpRange() {
        return { ...state.topUp };
      },
      async updateTopUpRange(patch) {
        const next = { ...state.topUp, ...patch };
        if (num(next.min) <= 0) throw new Error("The minimum has to be more than zero.");
        if (num(next.max) < num(next.min)) throw new Error("The maximum can't be less than the minimum.");
        state.topUp = next;
        return { ...next };
      },
    },

    usage: {
      async listUsage({ limit = 50, ...filter }) {
        return usageOf(filter).slice(0, limit);
      },
      async getUsageSummary(filter): Promise<UsageSummary> {
        const entries = usageOf(filter);
        const byApp = new Map<string, { app: string; credits: number; jobs: number }>();
        for (const entry of entries) {
          const row = byApp.get(entry.app) ?? { app: entry.app, credits: 0, jobs: 0 };
          row.credits += entry.credits;
          row.jobs += 1;
          byApp.set(entry.app, row);
        }
        return {
          credits: entries.reduce((total, entry) => total + entry.credits, 0),
          wholesale: { amount: entries.reduce((total, entry) => total + num(entry.wholesale), 0).toFixed(4), currency: "USD" },
          jobs: entries.length,
          by_app: [...byApp.values()].sort((a, b) => b.credits - a.credits),
        };
      },
      async getUsageByMember(accountId) {
        const rows = new Map<string, MemberUsage>();
        // Every member has a row, used or not, so the list of people is complete.
        for (const member of membersOf(accountId)) rows.set(`m:${member.user_id}`, { member_id: member.user_id, key_id: null, credits: 0, jobs: 0, last_used_at: null });
        for (const entry of usageOf({ userId: accountId })) {
          const key = entry.key_id ? `k:${entry.key_id}` : `m:${entry.member_id}`;
          const row = rows.get(key) ?? { member_id: entry.key_id ? null : entry.member_id, key_id: entry.key_id, credits: 0, jobs: 0, last_used_at: null };
          row.credits += entry.credits;
          row.jobs += 1;
          if (!row.last_used_at || entry.created_at > row.last_used_at) row.last_used_at = entry.created_at;
          rows.set(key, row);
        }
        return [...rows.values()].sort((a, b) => b.credits - a.credits);
      },
    },

    workspaces: {
      async list() {
        return state.workspaces.map(toWorkspace);
      },
      async listForUser(userId) {
        return state.members
          .filter((entry) => entry.user_id === userId)
          .map((entry) => ({ workspace: toWorkspace(workspaceOf(entry.workspace_id)), role: entry.role }))
          .sort((a, b) => a.workspace.name.localeCompare(b.workspace.name));
      },
      async get(workspaceId) {
        const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
        return workspace ? toWorkspace(workspace) : null;
      },
      async create({ name, ownerId }) {
        must(state.users.find((entry) => entry.id === ownerId), "user");
        const created_at = new Date().toISOString();
        const workspace = { id: id("wsp"), name: cleanName(name), status: "active" as const, owner_id: ownerId, created_at };
        state.workspaces.push(workspace);
        state.members.push({ workspace_id: workspace.id, user_id: ownerId, role: "owner", joined_at: created_at });
        // A new workspace has a budget of its own from the start, with nothing in it.
        state.allocations.push({ id: id("alc"), grant_id: "", user_id: workspace.id, status: "active", granted: usd(0), spent: usd(0), available: usd(0) });
        return toWorkspace(workspace);
      },
      async rename(workspaceId, name) {
        const workspace = workspaceOf(workspaceId);
        workspace.name = cleanName(name);
        for (const invitation of state.invitations) if (invitation.workspace_id === workspaceId) invitation.workspace_name = workspace.name;
        return toWorkspace(workspace);
      },
      async setStatus(workspaceId, status) {
        const workspace = workspaceOf(workspaceId);
        workspace.status = status;
        const allocation = allocationOf(workspaceId);
        if (allocation && allocation.status !== "revoked") allocation.status = status;
        return toWorkspace(workspace);
      },
      async listMembers(workspaceId) {
        return membersOf(workspaceId)
          .map(toMember)
          .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));
      },
      async setMemberRole(workspaceId, userId, role) {
        const member = memberOf(workspaceId, userId);
        if (member.role === "owner") throw new Error("The owner's role changes only by transferring the workspace.");
        if (role !== "admin" && role !== "member") throw new Error("A member can be made an admin or a member.");
        member.role = role;
        return toMember(member);
      },
      async removeMember(workspaceId, userId) {
        if (memberOf(workspaceId, userId).role === "owner") throw new Error("The owner can't leave a workspace without transferring it.");
        state.members = state.members.filter((entry) => !(entry.workspace_id === workspaceId && entry.user_id === userId));
      },
      async transferOwnership(workspaceId, toUserId) {
        const workspace = workspaceOf(workspaceId);
        const next = memberOf(workspaceId, toUserId);
        if (next.role === "owner") return toWorkspace(workspace);
        memberOf(workspaceId, workspace.owner_id).role = "admin";
        next.role = "owner";
        workspace.owner_id = toUserId;
        return toWorkspace(workspace);
      },
      async listInvitations(workspaceId) {
        return state.invitations
          .filter((entry) => entry.workspace_id === workspaceId)
          .map(current)
          .filter((entry) => entry.status === "pending" || entry.status === "expired")
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
      },
      async listInvitationsForUser(userId) {
        const email = state.users.find((entry) => entry.id === userId)?.email?.toLowerCase();
        if (!email) return [];
        return state.invitations.map(current).filter((entry) => entry.status === "pending" && entry.email === email);
      },
      async getInvitation(token) {
        const invitation = state.invitations.find((entry) => entry.token === token);
        return invitation ? current(invitation) : null;
      },
      async invite(workspaceId, { email, role, invitedBy }) {
        const workspace = workspaceOf(workspaceId);
        const address = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("That doesn't look like an email address.");
        if (role !== "admin" && role !== "member") throw new Error("People are invited as an admin or a member.");
        if (membersOf(workspaceId).some((entry) => toMember(entry).email?.toLowerCase() === address)) throw new Error("That person is already a member.");
        const created_at = new Date().toISOString();
        const expires_at = new Date(Date.now() + INVITATION_DAYS * DAY_MS).toISOString();
        const waiting = state.invitations.find((entry) => entry.workspace_id === workspaceId && entry.email === address && (entry.status === "pending" || entry.status === "expired"));
        if (waiting) {
          // Asking again renews the same invitation, so an old link keeps working.
          Object.assign(waiting, { role, invited_by: invitedBy, invited_by_name: toMember(memberOf(workspaceId, invitedBy)).name, created_at, expires_at, status: "pending" });
          return { ...waiting };
        }
        const invitationId = id("inv");
        const invitation: WorkspaceInvitation = {
          id: invitationId,
          workspace_id: workspaceId,
          workspace_name: workspace.name,
          email: address,
          role,
          invited_by: invitedBy,
          invited_by_name: toMember(memberOf(workspaceId, invitedBy)).name,
          token: `join_${invitationId.slice(4)}${crypto.randomUUID().replaceAll("-", "")}`,
          created_at,
          expires_at,
          status: "pending",
        };
        state.invitations.push(invitation);
        return { ...invitation };
      },
      async revokeInvitation(invitationId) {
        const invitation = must(state.invitations.find((entry) => entry.id === invitationId), "invitation");
        if (invitation.status === "pending") invitation.status = "revoked";
      },
      async acceptInvitation(token, userId) {
        const invitation = openInvitation(token);
        must(state.users.find((entry) => entry.id === userId), "user");
        const workspace = workspaceOf(invitation.workspace_id);
        const existing = membersOf(workspace.id).find((entry) => entry.user_id === userId);
        invitation.status = "accepted";
        if (existing) return { workspace: toWorkspace(workspace), role: existing.role };
        state.members.push({ workspace_id: workspace.id, user_id: userId, role: invitation.role, joined_at: new Date().toISOString() });
        return { workspace: toWorkspace(workspace), role: invitation.role };
      },
      async declineInvitation(token) {
        openInvitation(token).status = "declined";
      },
    },
  };
}

import { afterEach, describe, expect, it, vi } from "vitest";

import { UnsupportedByProvider, balanceInCredits, createBatteriesProvider, createMockProvider, creditsFor, topUpCredits } from "./index";

afterEach(() => vi.unstubAllGlobals());

const rule = { creditsPerUsd: 100, default: 1.3, perApp: { "text-to-video": 1.5 } };
const usd = (amount: string) => ({ amount, currency: "USD" });

describe("pricing rules", () => {
  it("a retail price is wholesale cost, marked up, in credits, rounded up", () => {
    expect(creditsFor(0.4, "music", rule)).toBe(52);
    expect(creditsFor(0.4, "text-to-video", rule)).toBe(60);
    expect(creditsFor(0.0001, "chat", rule)).toBe(1);
  });

  it("a credit balance is the allocation's available amount", () => {
    expect(balanceInCredits({ available: usd("24.80") }, rule)).toBe(2480);
    expect(balanceInCredits({ available: usd("-3.00") }, rule)).toBe(0);
  });
});

describe("top-ups of the user's own amount", () => {
  const packs = [
    { id: "small", credits: 1000, price: usd("10.00"), popular: false, active: true },
    { id: "large", credits: 5500, price: usd("50.00"), popular: false, active: true },
    { id: "retired", credits: 4000, price: usd("30.00"), popular: false, active: false },
  ];

  it("pays the rate of the largest offered pack the amount reaches, and the base rate below the smallest", () => {
    expect(topUpCredits(37, packs, 100)).toBe(3700);
    expect(topUpCredits(60, packs, 100)).toBe(6600);
    expect(topUpCredits(5, packs, 100)).toBe(500);
  });

  it("the operator's limits must make sense", async () => {
    const { plans } = createMockProvider();
    expect(await plans.updateTopUpRange({ max: usd("250.00") })).toMatchObject({ enabled: true, min: usd("5.00"), max: usd("250.00") });
    await expect(plans.updateTopUpRange({ min: usd("0.00") })).rejects.toThrow();
    await expect(plans.updateTopUpRange({ min: usd("300.00") })).rejects.toThrow();
  });
});

describe("mock provider", () => {
  it("supports every area", () => {
    expect(Object.values(createMockProvider().features).every(Boolean)).toBe(true);
  });

  it("a credit pack is a one-off allocation top-up", async () => {
    const provider = createMockProvider();
    const before = await provider.budgets.getAllocation("usr_demo_adam");
    const after = await provider.budgets.topUpAllocation("usr_demo_adam", usd("25.00"));
    expect(Number(after.available.amount)).toBeCloseTo(Number(before?.available.amount) + 25);
    expect(Number(after.spent.amount)).toBe(Number(before?.spent.amount));
  });

  it("provisions an allocation from a grant and refuses to over-allocate", async () => {
    const provider = createMockProvider();
    const grant = await provider.budgets.createGrant({ label: "Pilot", amount: usd("100.00") });
    const allocation = await provider.budgets.provisionAllocation({ userId: "usr_new", grantId: grant.id, amount: usd("60.00") });
    expect(allocation).toMatchObject({ status: "active", available: usd("60.00") });
    await expect(provider.budgets.provisionAllocation({ userId: "usr_other", grantId: grant.id, amount: usd("60.00") })).rejects.toThrow();
  });

  it("creates and edits credit packs, with one highlighted at most", async () => {
    const { plans } = createMockProvider();
    const pack = await plans.createCreditPack({ credits: 25000, price: usd("200.00"), popular: true, active: true });
    expect((await plans.listCreditPacks()).filter((entry) => entry.popular).map((entry) => entry.id)).toEqual([pack.id]);
    expect((await plans.listCreditPacks()).at(-1)?.id).toBe(pack.id);
    expect(await plans.updateCreditPack(pack.id, { active: false })).toMatchObject({ active: false, credits: 25000 });
    await expect(plans.createCreditPack({ credits: 0, price: usd("5.00"), popular: false, active: true })).rejects.toThrow();
    await expect(plans.updateCreditPack(pack.id, { price: usd("0.00") })).rejects.toThrow();
    await expect(plans.updateCreditPack("pck_nope", { active: true })).rejects.toThrow();
  });

  it("assigns and removes a plan", async () => {
    const provider = createMockProvider();
    const [plan] = await provider.plans.listPlans();
    expect((await provider.plans.assignPlan("usr_demo_adam", plan!.id))?.id).toBe(plan!.id);
    expect((await provider.plans.getUserPlan("usr_demo_adam"))?.name).toBe(plan!.name);
    await provider.plans.assignPlan("usr_demo_adam", null);
    expect(await provider.plans.getUserPlan("usr_demo_adam")).toBeNull();
  });

  it("pausing a user pauses their allocation", async () => {
    const provider = createMockProvider();
    await provider.identity.setUserStatus("usr_demo_adam", "paused");
    expect((await provider.budgets.getAllocation("usr_demo_adam"))?.status).toBe("paused");
  });

  it("summarises usage per user", async () => {
    const provider = createMockProvider();
    const summary = await provider.usage.getUsageSummary({ userId: "usr_demo_adam" });
    const entries = await provider.usage.listUsage({ userId: "usr_demo_adam", limit: 500 });
    expect(summary.jobs).toBe(entries.length);
    expect(summary.by_app.reduce((total, row) => total + row.credits, 0)).toBe(summary.credits);
  });
});

describe("workspaces in the mock provider", () => {
  const NORTHLIGHT = "wsp_northlight";

  it("a workspace is an account: it has its own allocation, plan and usage", async () => {
    const provider = createMockProvider();
    expect((await provider.budgets.getAllocation(NORTHLIGHT))?.user_id).toBe(NORTHLIGHT);
    expect((await provider.plans.getUserPlan(NORTHLIGHT))?.name).toBe("Studio");
    expect((await provider.usage.getUsageSummary({ userId: NORTHLIGHT })).jobs).toBeGreaterThan(0);
  });

  it("lists a person's memberships and a workspace's members, owner first", async () => {
    const provider = createMockProvider();
    expect((await provider.workspaces.listForUser("usr_demo_adam")).map((entry) => [entry.workspace.id, entry.role])).toEqual([[NORTHLIGHT, "admin"]]);
    const members = await provider.workspaces.listMembers(NORTHLIGHT);
    expect(members[0]).toMatchObject({ user_id: "usr_demo_ines", role: "owner", email: "ines@example.test" });
    expect((await provider.workspaces.get(NORTHLIGHT))?.member_count).toBe(members.length);
  });

  it("a new workspace has its owner as the only member and an empty budget", async () => {
    const provider = createMockProvider();
    const workspace = await provider.workspaces.create({ name: "  Tide   Pool ", ownerId: "usr_demo_adam" });
    expect(workspace).toMatchObject({ name: "Tide Pool", owner_id: "usr_demo_adam", member_count: 1, status: "active" });
    expect(await provider.budgets.getAllocation(workspace.id)).toMatchObject({ available: usd("0.00"), status: "active" });
    expect(await provider.plans.getUserPlan(workspace.id)).toBeNull();
    await expect(provider.workspaces.create({ name: "x", ownerId: "usr_demo_adam" })).rejects.toThrow();
  });

  it("invites by email, renews a waiting invitation, and joins with the invited role", async () => {
    const provider = createMockProvider();
    const first = await provider.workspaces.invite(NORTHLIGHT, { email: " Sam@Example.test ", role: "member", invitedBy: "usr_demo_adam" });
    expect(first).toMatchObject({ email: "sam@example.test", status: "pending", invited_by_name: "Adam Soffer", workspace_name: "Northlight Studio" });
    const again = await provider.workspaces.invite(NORTHLIGHT, { email: "sam@example.test", role: "admin", invitedBy: "usr_demo_ines" });
    expect(again).toMatchObject({ id: first.id, token: first.token, role: "admin" });
    expect((await provider.workspaces.listInvitationsForUser("usr_demo_sam")).map((entry) => entry.id)).toEqual([first.id]);

    expect(await provider.workspaces.acceptInvitation(first.token, "usr_demo_sam")).toMatchObject({ role: "admin", workspace: { id: NORTHLIGHT } });
    expect((await provider.workspaces.listMembers(NORTHLIGHT)).find((entry) => entry.user_id === "usr_demo_sam")?.role).toBe("admin");
    expect((await provider.workspaces.listInvitations(NORTHLIGHT)).some((entry) => entry.id === first.id)).toBe(false);
    await expect(provider.workspaces.acceptInvitation(first.token, "usr_demo_sam")).rejects.toThrow();
  });

  it("refuses an invitation to a member, a bad address, and an invitation as owner", async () => {
    const { workspaces } = createMockProvider();
    await expect(workspaces.invite(NORTHLIGHT, { email: "priya@example.test", role: "member", invitedBy: "usr_demo_adam" })).rejects.toThrow("already a member");
    await expect(workspaces.invite(NORTHLIGHT, { email: "not an address", role: "member", invitedBy: "usr_demo_adam" })).rejects.toThrow();
    await expect(workspaces.invite(NORTHLIGHT, { email: "new@example.test", role: "owner" as "admin", invitedBy: "usr_demo_adam" })).rejects.toThrow();
  });

  it("a cancelled, declined or expired invitation can't be accepted", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-23T12:00:00Z") });
    try {
      const { workspaces } = createMockProvider();
      const cancelled = await workspaces.invite(NORTHLIGHT, { email: "a@example.test", role: "member", invitedBy: "usr_demo_adam" });
      await workspaces.revokeInvitation(cancelled.id);
      await expect(workspaces.acceptInvitation(cancelled.token, "usr_demo_sam")).rejects.toThrow();
      const declined = await workspaces.invite(NORTHLIGHT, { email: "b@example.test", role: "member", invitedBy: "usr_demo_adam" });
      await workspaces.declineInvitation(declined.token);
      expect((await workspaces.getInvitation(declined.token))?.status).toBe("declined");
      const old = await workspaces.invite(NORTHLIGHT, { email: "c@example.test", role: "member", invitedBy: "usr_demo_adam" });
      vi.setSystemTime(new Date("2026-12-01T12:00:00Z"));
      expect((await workspaces.getInvitation(old.token))?.status).toBe("expired");
      await expect(workspaces.acceptInvitation(old.token, "usr_demo_sam")).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps exactly one owner: no demoting, no removing, only transferring", async () => {
    const { workspaces } = createMockProvider();
    await expect(workspaces.setMemberRole(NORTHLIGHT, "usr_demo_ines", "member")).rejects.toThrow();
    await expect(workspaces.removeMember(NORTHLIGHT, "usr_demo_ines")).rejects.toThrow();
    await expect(workspaces.transferOwnership(NORTHLIGHT, "usr_demo_sam")).rejects.toThrow();
    expect(await workspaces.transferOwnership(NORTHLIGHT, "usr_demo_adam")).toMatchObject({ owner_id: "usr_demo_adam" });
    const roles = Object.fromEntries((await workspaces.listMembers(NORTHLIGHT)).map((entry) => [entry.user_id, entry.role]));
    expect(roles).toMatchObject({ usr_demo_adam: "owner", usr_demo_ines: "admin" });
    expect(Object.values(roles).filter((role) => role === "owner")).toHaveLength(1);
  });

  it("changes a role and removes a member", async () => {
    const { workspaces } = createMockProvider();
    expect(await workspaces.setMemberRole(NORTHLIGHT, "usr_demo_priya", "admin")).toMatchObject({ role: "admin" });
    await workspaces.removeMember(NORTHLIGHT, "usr_demo_priya");
    expect((await workspaces.listForUser("usr_demo_priya")).map((entry) => entry.workspace.id)).toEqual(["wsp_harbour"]);
  });

  it("pausing a workspace pauses its allocation and leaves its members' own accounts alone", async () => {
    const provider = createMockProvider();
    expect(await provider.workspaces.setStatus(NORTHLIGHT, "paused")).toMatchObject({ status: "paused" });
    expect((await provider.budgets.getAllocation(NORTHLIGHT))?.status).toBe("paused");
    expect((await provider.budgets.getAllocation("usr_demo_ines"))?.status).toBe("active");
    expect((await provider.identity.getUser("usr_demo_ines"))?.status).toBe("active");
  });

  it("breaks usage down by member and by key, and the rows add up", async () => {
    const { usage } = createMockProvider();
    const rows = await usage.getUsageByMember(NORTHLIGHT);
    const summary = await usage.getUsageSummary({ userId: NORTHLIGHT });
    expect(rows.reduce((total, row) => total + row.credits, 0)).toBe(summary.credits);
    expect(rows.reduce((total, row) => total + row.jobs, 0)).toBe(summary.jobs);
    expect(rows.every((row) => (row.member_id === null) !== (row.key_id === null))).toBe(true);
    expect(rows.some((row) => row.key_id === "key_northlight_render")).toBe(true);
    const adam = await usage.getUsageSummary({ userId: NORTHLIGHT, memberId: "usr_demo_adam" });
    expect(adam.credits).toBe(rows.find((row) => row.member_id === "usr_demo_adam")?.credits);
  });

  it("an owner's account can't be deleted until the workspace is handed on", async () => {
    const provider = createMockProvider();
    await expect(provider.identity.deleteUser("usr_demo_ines")).rejects.toThrow();
    await provider.identity.deleteUser("usr_demo_priya");
    expect((await provider.workspaces.listMembers(NORTHLIGHT)).some((entry) => entry.user_id === "usr_demo_priya")).toBe(false);
  });
});

describe("batteries provider", () => {
  const provider = () => createBatteriesProvider({ url: "http://engine.test", reader: "reader", admin: "admin" });

  it("says what it cannot do", async () => {
    expect(provider().features).toMatchObject({ grants: true, plans: false, users: false, workspaces: false });
    expect(await provider().workspaces.listForUser("actor-1")).toEqual([]);
    await expect(provider().workspaces.create({ name: "Team", ownerId: "actor-1" })).rejects.toBeInstanceOf(UnsupportedByProvider);
    await expect(provider().identity.listUsers()).rejects.toBeInstanceOf(UnsupportedByProvider);
    expect(await provider().plans.listPlans()).toEqual([]);
    await expect(provider().plans.createCreditPack({ credits: 1000, price: usd("10.00"), popular: false, active: true })).rejects.toBeInstanceOf(UnsupportedByProvider);
  });

  it("reads an allocation with the reader token, never the admin token", async () => {
    const fetchMock = vi.fn(async (_url: URL | string, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ allocation_id: "alc_1", status: "active", granted: usd("50"), spent: usd("25.2"), available: usd("24.8") }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const allocation = await provider().budgets.getAllocation("actor-1");
    expect(allocation).toMatchObject({ id: "alc_1", status: "active", available: usd("24.8") });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://engine.test/v1/allowance?actor_id=actor-1");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer reader");
  });

  it("returns null for an actor without an allocation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect(await provider().budgets.getAllocation("nobody")).toBeNull();
  });

  it("uses the admin token and an operation_ref for writes", async () => {
    const fetchMock = vi.fn(
      async (_url: URL | string, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "g1", name: "Pilot", status: "active", currency: "USD", total: "100", metadata: {} }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await provider().budgets.createGrant({ label: "Pilot", amount: usd("100") });
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer admin");
    expect(JSON.parse(String(init?.body))).toMatchObject({ name: "Pilot", amount: { amount: "100", currency: "USD" } });
    expect(JSON.parse(String(init?.body)).operation_ref).toBeTruthy();
  });
});

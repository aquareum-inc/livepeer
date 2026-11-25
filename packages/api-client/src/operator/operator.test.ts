import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockProvider, createOperatorClient, memoryCapabilityStore } from "../index";

afterEach(() => vi.unstubAllGlobals());

const pricing = { creditsPerUsd: 100, default: 1.3 };
const mockClient = () => createOperatorClient({ provider: createMockProvider(), env: { MOCK_ONLY: "1" }, pricing });

describe("operator client, token use", () => {
  const engine = { url: "http://engine.test", reader: "reader-token", admin: "admin-token" };
  const respond = (body: unknown) => vi.fn(async (_url: URL | string, _init?: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));
  const auth = (mock: ReturnType<typeof respond>, call = 0) => (mock.mock.calls[call]?.[1]?.headers as Record<string, string>).Authorization;

  it("reads with the reader token, never the admin token", async () => {
    const fetchMock = respond([]);
    vi.stubGlobal("fetch", fetchMock);
    const client = createOperatorClient({ engine, provider: createMockProvider(), env: {}, pricing });
    await client.listJobs();
    await client.listActors();
    await client.listAccessKeys();
    for (let call = 0; call < 3; call += 1) expect(auth(fetchMock, call)).toBe("Bearer reader-token");
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "http://engine.test/v1/jobs?limit=50",
      "http://engine.test/v1/clearinghouse/actors",
      "http://engine.test/v1/clearinghouse/keys",
    ]);
  });

  it("writes with the admin token and an operation_ref", async () => {
    const fetchMock = respond({ key: { key_id: "k1" }, token: "lpk_x", replayed: false });
    vi.stubGlobal("fetch", fetchMock);
    const client = createOperatorClient({ engine, provider: createMockProvider(), env: {}, pricing });
    const issued = await client.issueAccessKey({ actor_id: "a1", label: "CI", kind: "actor" });
    expect(issued.source).toBe("live");
    expect(auth(fetchMock)).toBe("Bearer admin-token");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).operation_ref).toBeTruthy();
  });

  it("makes no engine call in mock-only mode", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = createOperatorClient({ engine, provider: createMockProvider(), env: { MOCK_ONLY: "1" }, pricing });
    expect((await client.listJobs()).source).toBe("mock");
    expect((await client.getEngineHealth()).source).toBe("mock");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("operator client, mock data", () => {
  it("mock jobs have the engine's shape", async () => {
    const [job] = (await mockClient().listJobs(5)).data;
    expect(Object.keys(job!).sort()).toEqual(
      ["actor_id", "app", "attempts", "capability", "completed_at", "created_at", "failure", "id", "mode", "model", "operation_ref", "state", "tenant_id"],
    );
  });

  it("overview margin is revenue minus wholesale cost", async () => {
    const { data } = await mockClient().getOverview();
    expect(data.margin_usd).toBeCloseTo(data.revenue_usd - data.wholesale_usd, 6);
    expect(data.revenue_estimated).toBe(true);
    expect(data.series).toHaveLength(14);
  });

  it("ends the chart on today’s figures, so it never disagrees with the cards", async () => {
    const { data } = await mockClient().getOverview();
    expect(data.series.at(-1)).toMatchObject({ revenue_usd: data.revenue_usd, wholesale_usd: data.wholesale_usd });
  });

  it("derives compute operators from the jobs they served and can block one", async () => {
    const client = mockClient();
    const operators = (await client.listComputeOperators()).data;
    expect(operators.length).toBeGreaterThan(0);
    expect(operators.reduce((total, entry) => total + entry.jobs, 0)).toBe(200);
    await client.setComputeOperatorBlocked(operators[0]!.orchestrator_url, true);
    expect((await client.listComputeOperators()).data[0]?.status).toBe("blocked");
  });

  it("refunds a paid payment once", async () => {
    const client = mockClient();
    const paid = (await client.listPayments()).data.find((payment) => payment.status === "paid")!;
    expect((await client.refundPayment(paid.id)).data?.status).toBe("refunded");
    expect((await client.refundPayment(paid.id)).data).toBeNull();
  });

  it("suspending a user pauses their allocation at the provider", async () => {
    const client = mockClient();
    await client.setActorStatus("default", "usr_demo_adam", "paused");
    expect((await client.provider.budgets.getAllocation("usr_demo_adam"))?.status).toBe("paused");
    // The list of accounts says so too, as the engine's does, and stops saying so once they are resumed.
    const status = async () => (await client.listActors()).data.find((actor) => actor.actor_id === "usr_demo_adam")?.allocation?.status;
    expect(await status()).toBe("paused");
    await client.setActorStatus("default", "usr_demo_adam", "active");
    expect(await status()).toBe("active");
  });

  it("stores a capability's enabled state, markup and surface override", async () => {
    const client = mockClient();
    expect((await client.getCapabilitySetting("music")).data).toEqual({ app: "music", enabled: true, markup: null, surfaces: null });
    const updated = (await client.updateCapabilitySetting("music", { enabled: false, markup: 1.5 })).data;
    expect(updated).toMatchObject({ enabled: false, markup: 1.5 });
  });

  it("keeps capability settings in the store users are served and priced from", async () => {
    const capabilities = memoryCapabilityStore({ chat: { markup: 2 } });
    const client = createOperatorClient({ provider: createMockProvider(), env: { MOCK_ONLY: "1" }, pricing, capabilities });
    expect((await client.getCapabilitySetting("chat")).data.markup).toBe(2);
    await client.updateCapabilitySetting("text-to-video", { markup: 1.5, enabled: false, surfaces: ["chat"] });
    expect(capabilities.read("text-to-video")).toEqual({ enabled: false, markup: 1.5, surfaces: ["chat"] });
    await client.updateCapabilitySetting("chat", { markup: null });
    expect(capabilities.read("chat").markup).toBeNull();
    await expect(client.updateCapabilitySetting("chat", { markup: 0.5 })).rejects.toThrow();
    // Resetting forgets what was changed here, and nothing the store started with.
    expect((await client.resetCapabilitySettings()).data).toBe(true);
    expect(capabilities.read("text-to-video")).toEqual({ enabled: true, markup: null, surfaces: null });
    expect(capabilities.read("chat").markup).toBe(2);
  });

  it("lists workspaces with their owner, plan and budget", async () => {
    const { data } = await mockClient().listWorkspaces();
    expect(data.map((workspace) => workspace.name)).toEqual(["Harbour Films", "Northlight Studio"]);
    expect(data[1]).toMatchObject({ owner_name: "Inés Castellanos", member_count: 4, plan: "Studio", budget: 600, remaining: 366.6, status: "active" });
  });

  it("shows a workspace's members with their usage, and never an invitation's link", async () => {
    const { data } = await mockClient().getWorkspace("wsp_northlight");
    expect(data?.members.map((member) => member.role)).toEqual(["owner", "admin", "member", "member"]);
    expect(data?.members.every((member) => member.jobs > 0)).toBe(true);
    expect(data?.invitations.map((invitation) => invitation.email)).toEqual(["lena@example.test"]);
    expect(data?.invitations.some((invitation) => "token" in invitation)).toBe(false);
    expect(data?.other_usage).toMatchObject([{ kind: "key", id: "key_northlight_render" }]);
    expect((await mockClient().getWorkspace("wsp_nope")).data).toBeNull();
  });

  it("suspending a workspace pauses its allocation and leaves its members alone", async () => {
    const client = mockClient();
    expect((await client.setWorkspaceStatus("wsp_northlight", "paused")).data.status).toBe("paused");
    expect((await client.provider.budgets.getAllocation("wsp_northlight"))?.status).toBe("paused");
    expect((await client.provider.identity.getUser("usr_demo_ines"))?.status).toBe("active");
    expect((await client.setWorkspaceStatus("wsp_northlight", "active")).data.status).toBe("active");
  });
});

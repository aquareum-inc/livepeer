import { MOCK_ONLY_DEMO_KEY, quoteCredits, createApiClient, createMockProvider, createOperatorClient, type DeviceSession, type InstanceDescription } from "@livepeer/api-client";
import { describePrivacy } from "@livepeer/user-app/privacy";
import { describeStudio } from "@livepeer/user-app/studio-mediums";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { memoryModerationStore, moderation } from "../moderation/moderation";
import { auditLog } from "../operator-devices/audit";
import { operatorDeviceSessions } from "../operator-devices/sessions";
import { TEST_SECRET, emptyAudit, emptyOperatorDevices } from "../operator-devices/testing";
import { ApiError, OPERATIONS, matchOperation, type Account, type AlertsAccess, type Context, type DeviceAccess } from "./operations";

const provider = createMockProvider();
const client = createApiClient({ env: { MOCK_ONLY: "1" }, provider });
const operator = createOperatorClient({ provider, env: { MOCK_ONLY: "1" }, pricing: { creditsPerUsd: 100, default: 1.3 } });

const instance: InstanceDescription = {
  api_version: "1",
  name: "Test instance",
  logo: { symbol: null, wordmark: null, tint: true },
  theme: { dark: {}, light: {} },
  surfaces: { app: true, console: true, api: true, mcp: true, mobile: true, mobile_console: true },
  mobile: { ios: { bundle_id: "org.livepeer.app.dev", minimum_version: null }, android: null },
  sign_in: { methods: ["email"], sign_up: "open" },
  content: { characters: true, adult_content: false },
  home: { background_image: null, background_poster: null, background_video: null, aurora: false },
};

const labels = async () => [{ app: "text-to-video", name: "Text to video", work: "Text to video" }];

const phone: DeviceSession = { id: "dev_1", name: "Test iPhone", platform: "ios", created_at: "2026-11-20T09:00:00Z", last_used_at: "2026-11-20T09:00:00Z", current: true };
const devices: DeviceAccess = {
  redeemCode: async ({ code }) => (code === "good" ? { token: "aqd_test", device: phone } : null),
  list: async (userId, currentId) => (userId === "usr_demo_adam" ? [{ ...phone, current: phone.id === currentId }] : []),
  setWorkspace: vi.fn(async (id: string) => id === phone.id),
  revoke: async (userId, id) => userId === "usr_demo_adam" && id === phone.id,
  revokeAll: vi.fn(async () => 1),
};
const agentModelMenu = async () => [];
const studioMediums = async () => describeStudio([]);
const desk = moderation(memoryModerationStore());
const audit = auditLog(emptyAudit());
const alerts: AlertsAccess = { offered: () => true, accepts: () => true, reportFiled: vi.fn(), phoneAdded: vi.fn(), test: async () => "sent" };
const base: Context = { via: "api_key", client, operator: null, account: null, devices, operatorDevice: null, operatorDevices: operatorDeviceSessions(emptyOperatorDevices(), TEST_SECRET, audit), audit, alerts, moderation: desk, privacy: () => describePrivacy(false), instance, labels, agentModelMenu, studioMediums, quote: quoteCredits };
const adam: Account = { user: { id: "usr_demo_adam", name: "Adam Soffer", email: "adam@example.test" }, role: "user", deviceId: "dev_1" };

describe("public API operations", () => {
  it("names and routes are unique", async () => {
    expect(new Set(OPERATIONS.map((operation) => operation.name)).size).toBe(OPERATIONS.length);
    expect(new Set(OPERATIONS.map((operation) => `${operation.method} ${operation.path}`)).size).toBe(OPERATIONS.length);
  });

  it("every operation describes itself and its input for agents", async () => {
    for (const operation of OPERATIONS) {
      expect(operation.description.length).toBeGreaterThan(20);
      expect(operation.input).toMatchObject({ type: "object" });
    }
  });

  it("matches REST routes and extracts path inputs", async () => {
    expect(matchOperation("GET", ["offerings"])?.operation.name).toBe("list_capabilities");
    expect(matchOperation("POST", ["conversations", "cnv_1", "messages"])).toMatchObject({ operation: { name: "send_message" }, params: { id: "cnv_1" } });
    expect(matchOperation("GET", ["nope"])).toBeNull();
    expect(matchOperation("DELETE", ["offerings"])).toBeNull();
  });

  it("runs the main flow: generate, then poll", async () => {
    const create = OPERATIONS.find((operation) => operation.name === "create_generation")!;
    const created = (await create.run(base, { kind: "video", app: "text-to-video", prompt: "A harbour at first light" })) as { id: string; state: string };
    expect(created.state).toBe("queued");
    const get = OPERATIONS.find((operation) => operation.name === "get_generation")!;
    expect(await get.run(base, { id: created.id })).toMatchObject({ id: created.id });
    await expect(get.run(base, { id: "gen_missing" })).rejects.toMatchObject({ status: 404 });
  });

  it("refuses operator operations without the operator role", async () => {
    const overview = OPERATIONS.find((operation) => operation.name === "operator_overview")!;
    await expect(overview.run(base, {})).rejects.toBeInstanceOf(ApiError);
    await expect(overview.run({ ...base, operator }, {})).resolves.toHaveProperty("jobs_today");
  });

  it("an agent can administer a user: suspend, top up, assign a plan", async () => {
    const run = (name: string, input: Record<string, unknown>) => OPERATIONS.find((operation) => operation.name === name)!.run({ ...base, operator }, input);
    await run("operator_set_user_status", { id: "usr_demo_priya", status: "paused" });
    expect((await provider.budgets.getAllocation("usr_demo_priya"))?.status).toBe("paused");
    expect(devices.revokeAll).toHaveBeenCalledWith("usr_demo_priya");
    const before = Number((await provider.budgets.getAllocation("usr_demo_priya"))?.available.amount);
    await run("operator_top_up_user", { id: "usr_demo_priya", amount_usd: 10 });
    expect(Number((await provider.budgets.getAllocation("usr_demo_priya"))?.available.amount)).toBeCloseTo(before + 10);
    await run("operator_assign_plan", { id: "usr_demo_priya", plan_id: "pln_studio" });
    expect((await provider.plans.getUserPlan("usr_demo_priya"))?.id).toBe("pln_studio");
  });

  it("every operation outside the operator's says what it answers with", async () => {
    for (const operation of OPERATIONS) if (!operation.operator) expect(operation.output, operation.name).toBeDefined();
  });

  it("only an operator operation that says what it answers with is marked for phones, and the marked ones are exactly these", async () => {
    for (const operation of OPERATIONS.filter((entry) => entry.mobile)) {
      expect(operation.operator, operation.name).toBe(true);
      expect(operation.output, operation.name).toBeDefined();
      // A read is a GET and a change is not, so a change can never be made by following a link.
      expect(operation.method === "GET", operation.name).toBe(operation.mobile === "read");
    }
    const marked = (mark: "read" | "confirm") => OPERATIONS.filter((operation) => operation.mobile === mark).map((operation) => operation.name).sort();
    expect(marked("read")).toEqual(["operator_costs", "operator_get_alerts", "operator_health", "operator_list_capabilities", "operator_list_compute", "operator_list_grants", "operator_list_jobs", "operator_list_plans", "operator_list_reports", "operator_list_users", "operator_overview", "operator_status"]);
    expect(marked("confirm")).toEqual(["operator_resolve_report", "operator_set_alerts", "operator_set_user_status", "operator_test_alert"]);
  });

  it("answers the Status screen in one call, and says what needs the operator", async () => {
    const run = (name: string, input: Record<string, unknown> = {}) => OPERATIONS.find((operation) => operation.name === name)!.run({ ...base, operator }, input);
    const status = (await run("operator_status")) as { attention: Array<{ kind: string; message: string; count: number | null; opens: string }>; today: Record<string, unknown>; service: Record<string, unknown>; checked_at: string };
    expect(status.today).toMatchObject({ active_users: expect.any(Number), jobs: expect.any(Number), failed: expect.any(Number), revenue_usd: expect.any(Number), margin_usd: expect.any(Number) });
    expect(status.service).toMatchObject({ engine_ready: expect.any(Boolean), engine_version: expect.any(String) });
    expect(status.attention.some((entry) => entry.kind === "reports_waiting")).toBe(false);
    await desk.report("usr_demo_priya", { slug: "juno-live", name: "Juno", author: "relay-club" } as never, "spam", null);
    const after = (await run("operator_status")) as typeof status;
    expect(after.attention).toContainEqual({ kind: "reports_waiting", message: "1 report is waiting", count: 1, opens: "reports" });
  });

  it("filters and pages the operator's jobs, and searches users, on the server", async () => {
    const run = (name: string, input: Record<string, unknown> = {}) => OPERATIONS.find((operation) => operation.name === name)!.run({ ...base, operator }, input);
    const all = (await run("operator_list_jobs", { limit: 30 })) as Array<{ id: string; state: string; created_at: string }>;
    expect(all.length).toBe(30);
    const failed = (await run("operator_list_jobs", { status: "failed", limit: "10" })) as typeof all;
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((job) => job.state === "failed")).toBe(true);
    const older = (await run("operator_list_jobs", { before: all[9]!.created_at, limit: 5 })) as typeof all;
    expect(older.length).toBe(5);
    expect(older.every((job) => Date.parse(job.created_at) < Date.parse(all[9]!.created_at))).toBe(true);
    await expect(run("operator_list_jobs", { status: "exploded" })).rejects.toMatchObject({ status: 400 });
    await expect(run("operator_list_jobs", { before: "yesterday" })).rejects.toMatchObject({ status: 400 });

    const users = (await run("operator_list_users")) as Array<{ actor_id: string; label: string }>;
    const one = users[0]!;
    const found = (await run("operator_list_users", { query: ` ${one.actor_id.toUpperCase()} ` })) as typeof users;
    expect(found).toEqual([one]);
    expect(users.length).toBeGreaterThan(1);
    expect(await run("operator_list_users", { query: "no-one-is-called-this" })).toEqual([]);
  });

  it("only reads are open to guests, apart from collecting a sign-in, and none of them is the operator's", async () => {
    const open = OPERATIONS.filter((operation) => operation.public);
    expect(open.map((operation) => operation.name).sort()).toEqual(["create_device_session", "create_operator_device_session", "get_character", "get_instance", "get_privacy", "list_agent_model_menu", "list_agent_models", "list_capabilities", "list_capability_labels", "list_characters", "list_prompt_starters", "list_showcase", "list_studio_mediums", "quote_generation"]);
    for (const operation of open) expect((operation.method === "GET" || operation.name === "create_device_session" || operation.name === "create_operator_device_session") && !operation.operator, operation.name).toBe(true);
  });

  it("keeps the apps' sign-in plumbing, account switching and uploads from a device away from agents", async () => {
    expect(OPERATIONS.filter((operation) => operation.mcp === false).map((operation) => operation.name).sort()).toEqual(["create_device_session", "create_operator_challenge", "create_operator_device_session", "delete_account", "delete_operator_device_session", "end_device_session", "request_upload", "switch_account", "unlock_operator_device_session"]);
  });

  it("says where to send a file, and refuses one it can't take with a reason a client can act on", async () => {
    const ask = OPERATIONS.find((operation) => operation.name === "request_upload")!;
    const ticket = (await ask.run(base, { kind: "image", name: "tide.png", content_type: "image/png", size_bytes: 2048, aspect: "1:1" })) as { id: string; path: string };
    expect(ticket.path).toBe(`/api/v1/uploads/${ticket.id}`);
    await expect(ask.run(base, { kind: "image", name: "tide.heic", content_type: "image/heic", size_bytes: 2048 })).rejects.toMatchObject({ status: 415, code: "unsupported_type" });
    await expect(ask.run(base, { kind: "video", name: "long.mp4", content_type: "video/mp4", size_bytes: 300 * 1024 * 1024 })).rejects.toMatchObject({ status: 413, code: "too_large" });
    await expect(ask.run(base, { kind: "audio", name: "a.mp3", content_type: "audio/mpeg", size_bytes: 10 })).rejects.toMatchObject({ status: 400 });
  });

  it("collects a sign-in once, with a reason a client can act on when it can't", async () => {
    const collect = OPERATIONS.find((operation) => operation.name === "create_device_session")!;
    expect(await collect.run(base, { code: "good", verifier: "v", platform: "ios" })).toMatchObject({ token: "aqd_test", device: { id: "dev_1" } });
    await expect(collect.run(base, { code: "used", verifier: "v", platform: "ios" })).rejects.toMatchObject({ status: 400, code: "sign_in_expired" });
  });

  it("knows who is signed in, and refuses account operations to an API key", async () => {
    const run = (name: string, input: Record<string, unknown>, account: Account | null) => OPERATIONS.find((operation) => operation.name === name)!.run({ ...base, account }, input);
    expect(await run("get_me", {}, adam)).toMatchObject({ id: "usr_demo_adam", name: "Adam Soffer", role: "user", balance: { credits: expect.any(Number) } });
    expect(await run("get_me", {}, { ...adam, role: "operator" })).toMatchObject({ role: "operator" });
    await expect(run("get_me", {}, null)).rejects.toMatchObject({ status: 403, code: "account_required" });
    expect(await run("list_devices", {}, adam)).toEqual([phone]);
    await expect(run("revoke_device", { id: "dev_other" }, adam)).rejects.toMatchObject({ status: 404 });
    expect(await run("revoke_device", { id: "dev_1" }, adam)).toEqual({ deleted: true });
    expect(await run("end_device_session", {}, adam)).toEqual({ deleted: true });
    await expect(run("end_device_session", {}, { ...adam, deviceId: null })).rejects.toMatchObject({ status: 400 });
  });

  it("says which account the person is working in, and lets an app switch to one they belong to", async () => {
    const run = (name: string, input: Record<string, unknown>, context: Partial<Context>) => OPERATIONS.find((operation) => operation.name === name)!.run({ ...base, via: "device", account: adam, ...context }, input);
    const inNorthlight = createApiClient({ env: { MOCK_ONLY: "1" }, provider, user: { id: "usr_demo_adam", name: "Adam Soffer" }, workspaceId: "wsp_northlight" });

    expect(await run("get_me", {}, {})).toMatchObject({ account: { id: "usr_demo_adam", kind: "personal", role: "owner" }, balance: { credits: 2480 } });
    expect(await run("get_me", {}, { client: inNorthlight })).toMatchObject({ account: { id: "wsp_northlight", kind: "workspace", name: "Northlight Studio", role: "admin" }, balance: { credits: 36660 } });

    const list = (await run("list_accounts", {}, {})) as { current: string; accounts: Array<{ id: string }>; invitations: Array<Record<string, unknown>> };
    expect(list.accounts.map((entry) => entry.id)).toEqual(["usr_demo_adam", "wsp_northlight"]);
    // An app is told an invitation exists, never given the link that answers it.
    expect(list.invitations).toEqual([expect.objectContaining({ workspace_name: "Harbour Films", invited_by_name: "Sam Whitfield" })]);
    expect(list.invitations.some((invitation) => "token" in invitation)).toBe(false);

    expect(await run("switch_account", { account_id: "wsp_northlight" }, {})).toMatchObject({ current: "wsp_northlight" });
    expect(devices.setWorkspace).toHaveBeenLastCalledWith("dev_1", "wsp_northlight");
    expect(await run("switch_account", { account_id: "usr_demo_adam" }, { client: inNorthlight })).toMatchObject({ current: "usr_demo_adam" });
    expect(devices.setWorkspace).toHaveBeenLastCalledWith("dev_1", null);

    await expect(run("switch_account", { account_id: "wsp_harbour" }, {})).rejects.toMatchObject({ status: 404, code: "not_a_member" });
    await expect(run("switch_account", { account_id: "wsp_northlight" }, { via: "browser", account: { ...adam, deviceId: null } })).rejects.toMatchObject({ status: 400, code: "device_only" });
    await expect(run("list_accounts", {}, { account: null })).rejects.toMatchObject({ status: 403, code: "account_required" });
  });

  it("answers an invitation by its id, only for the person it is waiting for, and moves an app into the workspace", async () => {
    const fresh = createMockProvider();
    const as = (id: string, name: string) => createApiClient({ env: { MOCK_ONLY: "1" }, provider: fresh, user: { id, name } });
    const run = (name: string, input: Record<string, unknown>, context: Partial<Context>) => OPERATIONS.find((operation) => operation.name === name)!.run({ ...base, via: "device", account: adam, client: as("usr_demo_adam", "Adam Soffer"), ...context }, input);
    const priya: Account = { user: { id: "usr_demo_priya", name: "Priya Raman", email: "priya@example.test" }, role: "user", deviceId: "dev_2" };

    // The invitation waits for Adam: nobody else can answer it, whoever knows its id.
    await expect(run("accept_invitation", { id: "inv_adam" }, { account: priya, client: as("usr_demo_priya", "Priya Raman") })).rejects.toMatchObject({ status: 404, code: "invitation_closed" });
    await expect(run("accept_invitation", { id: "inv_adam" }, { account: null })).rejects.toMatchObject({ status: 403 });

    const joined = (await run("accept_invitation", { id: "inv_adam" }, {})) as { current: string; accounts: Array<{ id: string; role: string }>; invitations: unknown[] };
    expect(joined.current).toBe("wsp_harbour");
    expect(joined.accounts.find((entry) => entry.id === "wsp_harbour")).toMatchObject({ role: "member" });
    expect(joined.invitations).toEqual([]);
    expect(devices.setWorkspace).toHaveBeenLastCalledWith("dev_1", "wsp_harbour");
    await expect(run("accept_invitation", { id: "inv_adam" }, {})).rejects.toMatchObject({ status: 404 });
  });

  it("declines an invitation and leaves the person where they were", async () => {
    const fresh = createMockProvider();
    const mine = createApiClient({ env: { MOCK_ONLY: "1" }, provider: fresh, user: { id: "usr_demo_adam", name: "Adam Soffer" } });
    const run = (name: string, input: Record<string, unknown>) => OPERATIONS.find((operation) => operation.name === name)!.run({ ...base, via: "device", account: adam, client: mine }, input);
    const calls = vi.mocked(devices.setWorkspace).mock.calls.length;
    expect(await run("decline_invitation", { id: "inv_adam" })).toMatchObject({ current: "usr_demo_adam", invitations: [] });
    expect((await mine.listAccounts()).data.accounts.map((entry) => entry.id)).toEqual(["usr_demo_adam", "wsp_northlight"]);
    expect(vi.mocked(devices.setWorkspace).mock.calls.length).toBe(calls);
    await expect(run("decline_invitation", { id: "inv_adam" })).rejects.toMatchObject({ status: 404, code: "invitation_closed" });
  });

  it("describes the instance and passes the agent's model and a cast character through", async () => {
    const run = (name: string, input: Record<string, unknown>) => OPERATIONS.find((operation) => operation.name === name)!.run(base, input);
    expect(await run("get_instance", {})).toMatchObject({ name: "Test instance", api_version: "1" });
    const conversation = (await run("create_conversation", { text: "A fox crossing a frozen lake", agent_model: "qwen3.8-27b" })) as { messages: Array<{ role: string; agent_model?: string | null }> };
    expect(conversation.messages[0]).toMatchObject({ role: "user", agent_model: "qwen3.8-27b" });
  });

  it("the demo key works on a mock-only instance and nowhere else", async () => {
    expect((await client.verifyApiKey(MOCK_ONLY_DEMO_KEY)).data).toMatchObject({ status: "active" });
    const real = createApiClient({ env: {}, provider });
    expect((await real.verifyApiKey(MOCK_ONLY_DEMO_KEY)).data).toBeNull();
  });

  it("deletes a conversation once, and says so when it's gone", async () => {
    const run = (name: string, input: Record<string, unknown>) => OPERATIONS.find((operation) => operation.name === name)!.run(base, input);
    const conversation = (await run("create_conversation", { text: "A heron on a still pond" })) as { id: string };
    expect(await run("delete_conversation", { id: conversation.id })).toEqual({ deleted: true });
    await expect(run("delete_conversation", { id: conversation.id })).rejects.toMatchObject({ status: 404 });
  });

  it("a follow-up can carry the shot's shape and length", async () => {
    const run = (name: string, input: Record<string, unknown>) => OPERATIONS.find((operation) => operation.name === name)!.run(base, input);
    const send = OPERATIONS.find((operation) => operation.name === "send_message")!;
    expect(Object.keys((send.input as { properties: object }).properties)).toEqual(expect.arrayContaining(["app", "aspect", "duration_seconds"]));
    const conversation = (await run("create_conversation", { text: "A heron on a still pond" })) as { id: string };
    expect(await run("send_message", { id: conversation.id, text: "Make it vertical", aspect: "9:16", duration_seconds: 10 })).toMatchObject({ id: conversation.id });
  });

  it("describes the studio and quotes a draft the way the web does", async () => {
    const run = (name: string, input: Record<string, unknown>) => OPERATIONS.find((operation) => operation.name === name)!.run(base, input);
    const studio = (await run("list_studio_mediums", {})) as Array<{ kind: string; modes: Array<{ value: string; available: boolean; needs_input: boolean }> }>;
    expect(studio.map((medium) => medium.kind)).toEqual(["video", "image", "audio"]);
    expect(studio[0]!.modes.find((mode) => mode.value === "edit")).toMatchObject({ needs_input: true, available: false });
    expect(await run("quote_generation", { kind: "video", app: "text-to-video", duration_seconds: "10", resolution: "1080p" })).toEqual({ credits: 176 });
    expect(await run("quote_generation", { kind: "image", app: "text-to-image" })).toEqual({ credits: 4 });
  });
  it("lists characters for guests, keeps adults-only ones off, and lets a person report and block", async () => {
    const run = (name: string, input: Record<string, unknown>, account: Account | null = adam) => OPERATIONS.find((operation) => operation.name === name)!.run({ ...base, account }, input);
    const guestList = (await run("list_characters", {}, null)) as Array<{ slug: string; mature: boolean }>;
    expect(guestList.length).toBeGreaterThan(0);
    expect(guestList.some((entry) => entry.mature)).toBe(false);
    await expect(run("get_character", { slug: "vesper" }, null)).rejects.toMatchObject({ status: 404 });
    expect(await run("get_character", { slug: "lumen" }, null)).toMatchObject({ name: "Lumen" });

    await expect(run("report_character", { slug: "lumen", reason: "spam" }, null)).rejects.toMatchObject({ status: 403, code: "account_required" });
    await expect(run("report_character", { slug: "lumen", reason: "rude" })).rejects.toMatchObject({ status: 400 });
    expect(await run("report_character", { slug: "lumen", reason: "impersonation", note: "  Claims to be a real tutor " })).toMatchObject({ character_slug: "lumen", author: "open-lens", note: "Claims to be a real tutor", state: "open" });
    expect(await run("block_character", { slug: "okon-the-editor" })).toEqual({ character_slug: "okon-the-editor", author: "cutting-room" });
    const after = (await run("list_characters", {})) as Array<{ slug: string }>;
    expect(after.map((entry) => entry.slug)).not.toContain("okon-the-editor");
    await expect(run("get_character", { slug: "okon-the-editor" })).rejects.toMatchObject({ status: 404 });
    expect(await run("get_character", { slug: "okon-the-editor" }, null)).toMatchObject({ name: "Okon" });

    const reports = OPERATIONS.find((operation) => operation.name === "operator_list_reports")!;
    await expect(reports.run(base, {})).rejects.toMatchObject({ status: 403 });
    const [report] = (await reports.run({ ...base, operator }, {})) as Array<{ id: string }>;
    await OPERATIONS.find((operation) => operation.name === "operator_resolve_report")!.run({ ...base, operator }, { id: report!.id, outcome: "hidden" });
    await expect(run("get_character", { slug: "lumen" }, null)).rejects.toMatchObject({ status: 404 });
  });

  it("creates a private character unless it's shared, and never one for adults only", async () => {
    const create = OPERATIONS.find((operation) => operation.name === "create_character")!;
    await expect(create.run(base, { name: "  ", description: "x", greeting: "y" })).rejects.toMatchObject({ status: 400 });
    await expect(create.run(base, { name: "A".repeat(41), description: "x", greeting: "y" })).rejects.toMatchObject({ status: 400 });
    const made = await create.run(base, { name: "Wren", description: "A sound recordist who hears everything.", greeting: "Quiet on set.", visibility: "public", mature: true });
    expect(made).toMatchObject({ name: "Wren", visibility: "public", mature: false, mine: true });
  });
  it("keeps adult content off phones, and deletes an account with everything the instance holds for it", async () => {
    const run = (name: string, input: Record<string, unknown>, account: Account | null = adam) => OPERATIONS.find((operation) => operation.name === name)!.run({ ...base, account }, input);
    expect(await run("get_preferences", {})).toMatchObject({ saveChats: true, defaultAspect: "16:9" });
    expect(await run("update_preferences", { defaultAspect: "9:16", defaultDuration: 10, saveChats: "no" })).toMatchObject({ defaultAspect: "9:16", defaultDuration: 10, saveChats: true });
    await expect(run("update_preferences", { adultContent: true })).rejects.toMatchObject({ status: 403, code: "web_only" });
    expect(await run("update_preferences", { ageConfirmed: true, adultContent: true }, { ...adam, deviceId: null })).toMatchObject({ adultContent: true });
    expect(await run("get_account", {})).toMatchObject({ plans: expect.any(Array), provider: { features: expect.any(Object) } });
    expect(await run("get_privacy", {}, null)).toMatchObject({ retains_chats: false, tiers: expect.arrayContaining([expect.objectContaining({ name: "Verified compute", status: "Planned, not available" })]) });

    await expect(run("delete_account", {}, null)).rejects.toMatchObject({ status: 403, code: "account_required" });
    await desk.block(adam.user.id, (await run("get_character", { slug: "juno-live" })) as never);
    expect(await run("delete_account", {})).toEqual({ deleted: true });
    expect(devices.revokeAll).toHaveBeenCalledWith(adam.user.id);
    expect((await desk.visible(adam.user.id))({ slug: "juno-live", author: "relay-club", mine: false } as never)).toBe(true);
    expect(await provider.identity.getUser(adam.user.id)).toBeNull();
  });
});

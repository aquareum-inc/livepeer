import type { AccountList, Accounts, AgentModelEntry, ApiClient, CapabilityLabel, Character, Preferences, PrivacyDescription, ReportReason, DeviceSession, GenerationRequest, StudioMedium, DeviceToken, EngineJob, InstanceDescription, OfferedCapability, OperatorAlertKind, OperatorAlerts, OperatorAttention, OperatorClient, OperatorStatus } from "@livepeer/api-client";

import type { Moderation } from "../moderation/moderation";
import type { AuditLog } from "../operator-devices/audit";
import type { OperatorDeviceSessions, PhoneAlertState } from "../operator-devices/sessions";
import type { OperatorDeviceRecord } from "../operator-devices/store";

type Schema = Record<string, unknown>;

/** A signed-in person: through a browser session, or a device session from the native apps. */
export interface Account {
  user: { id: string; name: string; email: string | null };
  /** Whether the provider marks them as an operator. It says what to offer; it grants nothing by itself. */
  role: "user" | "operator";
  /** The device session making the request, when it comes from an app. */
  deviceId: string | null;
}

/** How a caller proved who they are. */
export type Via = "guest" | "operator_token" | "browser" | "api_key" | "device" | "operator_device";

/** The instance's device sessions, as the operations use them. */
export interface DeviceAccess {
  redeemCode(input: { code: string; verifier: string; deviceName: string; platform: "ios" | "android" }): Promise<DeviceToken | null>;
  list(userId: string, currentId: string | null): Promise<DeviceSession[]>;
  /** Points a device session at a workspace, or at the personal account with null. */
  setWorkspace(id: string, workspaceId: string | null): Promise<boolean>;
  revoke(userId: string, id: string): Promise<boolean>;
  /** Ends every device session a user has. */
  revokeAll(userId: string): Promise<number>;
}

/** The instance's alerts to operators' phones, as the operations use them. */
export interface AlertsAccess {
  /** Whether the instance can send to a platform at all: it holds that platform's push credentials. */
  offered(platform: "ios" | "android"): Promise<boolean>;
  /** Whether a push token looks like one of that platform's. */
  accepts(platform: "ios" | "android", pushToken: string): boolean;
  /** A new report was filed, and this many are waiting now. Phones are told without holding up the answer. */
  reportFiled(waiting: number): void;
  /** A phone was enrolled for the console. The other phones are told without holding up the answer. */
  phoneAdded(sessionId: string): void;
  /** Sends one phone a test. */
  test(session: OperatorDeviceRecord): Promise<"sent" | "off" | "limited" | "not_delivered">;
}

export interface Context {
  /** How the caller authenticated. An operator device is held to the phone rules in `runOperation`. */
  via: Via;
  client: ApiClient;
  /** Present for callers with the operator role. */
  operator: OperatorClient | null;
  /** Who is signed in. API keys, the operator token and guests have no account. */
  account: Account | null;
  devices: DeviceAccess;
  /** The operator device session making the request, when it comes from the console on a phone. */
  operatorDevice: OperatorDeviceRecord | null;
  /** The instance's operator device sessions. */
  operatorDevices: OperatorDeviceSessions;
  /** The record of what operators' phones did and were refused. */
  audit: AuditLog;
  /** Alerts to operators' phones. */
  alerts: AlertsAccess;
  /** Reports, blocks and characters taken down. */
  moderation: Moderation;
  /** This instance, as it describes itself to clients. */
  instance: InstanceDescription;
  /** The readable name of each capability on offer, as the interface shows it. */
  labels: () => Promise<CapabilityLabel[]>;
  /** The agent's model menu, as the interface shows it. */
  agentModelMenu: () => Promise<AgentModelEntry[]>;
  /** The studio's mediums and modes, as the interface shows them. */
  studioMediums: () => Promise<StudioMedium[]>;
  /** Who can see a job on this instance, in the words every surface uses. */
  privacy: () => Promise<PrivacyDescription>;
  /** What one result of a draft would cost, in credits, as the web's studio quotes it. */
  quote: (request: GenerationRequest) => number;
}

/**
 * The exported API client type an operation answers with, or a one-element list for an array of it.
 * The OpenAPI document and the native clients' models are generated from these names.
 */
export type Output = string | [string];

export interface Operation {
  /** Tool name over MCP. */
  name: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** REST path under /api/v1; `{name}` segments become inputs. */
  path: string;
  input: Schema;
  /** What it answers with. Operator operations a phone can't call may leave it out; they are not in the generated clients. */
  output?: Output;
  operator?: boolean;
  /**
   * Whether an operator's phone may call this operator operation: "read" needs an unlocked session, "confirm"
   * needs its own proof every time. No mark means web only, so an operation added later is refused on phones
   * until someone decides otherwise.
   */
  mobile?: "read" | "confirm";
  /** Answers without a caller, as the instance's default account: what a guest can see on the web. */
  public?: boolean;
  /** Left out of the MCP server: sign-in plumbing for the native apps, which agents have no use for. */
  mcp?: false;
  run: (context: Context, input: Record<string, unknown>) => Promise<unknown>;
}

/**
 * A refused file as the API answers it: too large is 413, the wrong kind 415. The refusal is told by its
 * name, not its class: this file is also read by the client generator, which imports only types.
 */
export function uploadError(cause: unknown): unknown {
  if (!(cause instanceof Error) || cause.name !== "UploadRefused") return cause;
  const code = (cause as Error & { code?: string }).code;
  return new ApiError(code === "too_large" ? 413 : code === "unsupported_type" ? 415 : 400, cause.message, code);
}

const object = (properties: Schema, required: string[] = []): Schema => ({ type: "object", properties, required, additionalProperties: false });
const text = (description: string): Schema => ({ type: "string", description });
const str = (input: Record<string, unknown>, key: string): string => String(input[key] ?? "");
const REPORT_REASONS: readonly ReportReason[] = ["sexual", "hateful", "violent", "impersonation", "spam", "other"];
const aspect = { enum: ["16:9", "9:16", "1:1"], default: "16:9" };
const JOB_STATES = ["queued", "running", "succeeded", "failed", "uncertain"] as const;
/** How far back a filtered or paged list of jobs can reach: the most the engine's list is asked for. */
const JOBS_WINDOW = 500;

const operator = (context: Context): OperatorClient => {
  if (!context.operator) throw new ApiError(403, "This operation needs the operator role.");
  return context.operator;
};

export class ApiError extends Error {
  readonly status: number;
  /** A stable reason a client can act on, such as `mobile_off`. */
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** The operator device session making the request. These operations mean nothing to any other caller. */
const operatorPhone = (context: Context): OperatorDeviceRecord => {
  if (!context.operatorDevice) throw new ApiError(403, "This needs the console's own session on a phone.", "operator_device_required");
  return context.operatorDevice;
};

/** What a phone can choose to be told, in the order and words its Alerts page shows. A kind added here needs no app release. */
export const ALERT_CHOICES: ReadonlyArray<{ kind: OperatorAlertKind; label: string }> = [
  { kind: "engine_not_ready", label: "The engine stops being ready" },
  { kind: "jobs_failing", label: "Jobs are failing" },
  { kind: "reports_waiting", label: "A report is waiting" },
];

/** A phone's alerts as its Alerts page reads them. It never holds the push token. */
const alertsOf = async (context: Context, session: OperatorDeviceRecord, state: PhoneAlertState): Promise<OperatorAlerts> => ({
  offered: await context.alerts.offered(session.platform),
  state: state.state,
  kinds: ALERT_CHOICES.map((choice) => ({ ...choice, on: state.kinds.includes(choice.kind) })),
  until: state.until,
  last_alert_at: state.lastAlertAt,
});

/** Who is revoking a phone from the web console or the API, for the audit log. */
const revoker = (context: Context) => ({ userId: context.account?.user.id ?? "operator_token", name: context.account?.user.name ?? "Operator API token", deviceId: null, deviceName: null });

/**
 * The invitation the signed-in person is answering, by its id. Only one that is waiting for them is found, so
 * an id is never enough to answer someone else's, and the link that answers it never leaves the instance.
 */
const waitingInvitation = async (context: Context, id: unknown) => {
  signedIn(context);
  const invitation = (await context.client.listAccounts()).data.invitations.find((entry) => entry.id === id);
  if (!invitation) throw new ApiError(404, "That invitation is no longer open.", "invitation_closed");
  return invitation;
};

/** The person's accounts as an app is told of them: an invitation without the link that answers it. */
const accountList = (list: Accounts): AccountList => ({
  ...list,
  invitations: list.invitations.map(({ id, workspace_name, invited_by_name, role, expires_at }) => ({ id, workspace_name, invited_by_name, role, expires_at })),
});

const signedIn = (context: Context): Account => {
  if (!context.account) throw new ApiError(403, "This needs a signed-in person, not an API key.", "account_required");
  return context.account;
};

const found = <T>(value: T | null, what: string): T => {
  if (value === null) throw new ApiError(404, `${what} not found`);
  return value;
};

/** The settings a request changes, each only when it is present and of the right type. */
function preferencesPatch(input: Record<string, unknown>): Partial<Preferences> {
  const patch: Partial<Preferences> = {};
  for (const key of ["saveChats", "confirmBeforeSpending", "enterSends", "completionNotifications", "ageConfirmed", "adultContent"] as const) {
    if (typeof input[key] === "boolean") patch[key] = input[key];
  }
  if (input.defaultAspect === "16:9" || input.defaultAspect === "9:16" || input.defaultAspect === "1:1") patch.defaultAspect = input.defaultAspect;
  if (input.defaultDuration === 5 || input.defaultDuration === 10 || input.defaultDuration === 15) patch.defaultDuration = input.defaultDuration;
  return patch;
}

/** A character this caller may see: not for adults only, not taken down, not blocked. */
async function character(context: Context, slug: string): Promise<Character> {
  const value = (await context.client.getCharacter(slug)).data;
  if (!value || value.mature || !(await context.moderation.visible(context.account?.user.id ?? null))(value)) throw new ApiError(404, "Character not found");
  return value;
}

/** A character someone else shared, which is what can be reported or blocked. */
async function shared(context: Context, slug: string): Promise<Character> {
  const value = await character(context, slug);
  if (value.mine) throw new ApiError(400, "That character is yours.");
  return value;
}

/**
 * Every operation the instance exposes to agents and developers. The REST API and the MCP
 * server are both generated from this list, and each entry calls one API client function, so the
 * API can do exactly what the interface can.
 */
export const OPERATIONS: Operation[] = [
  { name: "get_instance", description: "Describe this instance: its name, logo and theme, what it serves, how to sign in and its content settings.", method: "GET", path: "/instance", output: "InstanceDescription", public: true, input: object({}), run: async ({ instance }) => instance },
  {
    name: "create_device_session",
    description: "Native apps: collect a finished sign-in with the one-time code from the sign-in callback and the PKCE verifier. Answers with a device session token, shown once.",
    method: "POST",
    path: "/auth/device",
    output: "DeviceToken",
    public: true,
    mcp: false,
    input: object({ code: text("The code from the sign-in callback"), verifier: text("The PKCE verifier whose challenge started the sign-in"), platform: { enum: ["ios", "android"] }, device_name: text("The device's own name, shown in the list of devices") }, ["code", "verifier", "platform"]),
    run: async ({ devices }, input) => {
      const token = await devices.redeemCode({ code: str(input, "code"), verifier: str(input, "verifier"), deviceName: str(input, "device_name"), platform: input.platform === "android" ? "android" : "ios" });
      if (!token) throw new ApiError(400, "That sign-in expired or was already used. Sign in again.", "sign_in_expired");
      return token;
    },
  },
  {
    name: "end_device_session",
    description: "Native apps: sign this device out by ending the device session making the request.",
    method: "DELETE",
    path: "/auth/device",
    output: "Deleted",
    mcp: false,
    input: object({}),
    run: async (context) => {
      const { user, deviceId } = signedIn(context);
      if (!deviceId) throw new ApiError(400, "Only a device session can sign itself out here.");
      return { deleted: await context.devices.revoke(user.id, deviceId) };
    },
  },
  {
    name: "get_me",
    description: "The signed-in person: their name, email, credit balance and whether they run this instance.",
    method: "GET",
    path: "/me",
    output: "Me",
    input: object({}),
    run: async (context) => {
      const { user, role } = signedIn(context);
      const [balance, list] = await Promise.all([context.client.getCreditBalance(), context.client.listAccounts()]);
      const account = list.data.accounts.find((entry) => entry.id === list.data.current) ?? list.data.accounts[0];
      return { ...user, role, balance: balance.data, account };
    },
  },
  {
    name: "list_accounts",
    description: "The accounts the person can work in (their own, and the workspaces they belong to, each with their role and its balance), which one is current, and invitations waiting, to answer with accept_invitation or decline_invitation.",
    method: "GET",
    path: "/accounts",
    output: "AccountList",
    input: object({}),
    run: async (context) => {
      signedIn(context);
      return accountList((await context.client.listAccounts()).data);
    },
  },
  {
    name: "accept_invitation",
    description: "Join the workspace an invitation waiting for the person is for. A native app starts working in it at once. Answers with their accounts as they now stand.",
    method: "POST",
    path: "/invitations/{id}/accept",
    output: "AccountList",
    input: object({ id: { type: "string", description: "An invitation id from list_accounts." } }, ["id"]),
    run: async (context, input) => {
      const invitation = await waitingInvitation(context, input.id);
      const workspace = (await context.client.acceptInvitation(invitation.token)).data;
      const list = (await context.client.listAccounts()).data;
      // An app moves into the workspace it just joined, as the web does.
      const deviceId = context.via === "device" ? context.account?.deviceId : null;
      const moved = deviceId ? await context.devices.setWorkspace(deviceId, workspace.id) : false;
      return accountList(moved ? { ...list, current: workspace.id } : list);
    },
  },
  {
    name: "decline_invitation",
    description: "Decline an invitation waiting for the person. Answers with their accounts, the invitation gone.",
    method: "POST",
    path: "/invitations/{id}/decline",
    output: "AccountList",
    input: object({ id: { type: "string", description: "An invitation id from list_accounts." } }, ["id"]),
    run: async (context, input) => {
      const invitation = await waitingInvitation(context, input.id);
      await context.client.declineInvitation(invitation.token);
      return accountList((await context.client.listAccounts()).data);
    },
  },
  {
    name: "switch_account",
    description: "From a native app: work in another of the person's accounts, their own or a workspace they belong to. Everything the app then reads and makes is that account's.",
    method: "POST",
    path: "/accounts/current",
    output: "AccountList",
    mcp: false,
    input: object({ account_id: { type: "string", description: "An account id from list_accounts." } }, ["account_id"]),
    run: async (context, input) => {
      const { deviceId } = signedIn(context);
      // A browser keeps its place in its session cookie, and a key belongs to one account: only an app switches here.
      if (context.via !== "device" || !deviceId) throw new ApiError(400, "Only a native app switches accounts this way.", "device_only");
      const list = (await context.client.listAccounts()).data;
      const target = list.accounts.find((entry) => entry.id === input.account_id);
      if (!target) throw new ApiError(404, "You don't belong to that account.", "not_a_member");
      if (!await context.devices.setWorkspace(deviceId, target.kind === "workspace" ? target.id : null)) throw new ApiError(401, "This device is no longer signed in.");
      return accountList({ ...list, current: target.id });
    },
  },
  { name: "list_devices", description: "List the phones and tablets signed in to the person's account, most recently used first.", method: "GET", path: "/devices", output: ["DeviceSession"], input: object({}), run: async (context) => { const { user, deviceId } = signedIn(context); return context.devices.list(user.id, deviceId); } },
  {
    name: "revoke_device",
    description: "Sign one of the person's devices out. The app on it returns to signed out on its next request.",
    method: "DELETE",
    path: "/devices/{id}",
    output: "Deleted",
    input: object({ id: text("Device session id, from list_devices") }, ["id"]),
    run: async (context, input) => {
      if (!await context.devices.revoke(signedIn(context).user.id, str(input, "id"))) throw new ApiError(404, "Device not found");
      return { deleted: true };
    },
  },
  {
    name: "create_operator_device_session",
    description: "Native apps: collect a finished operator sign-in with its one-time code and PKCE verifier, and enrol the phone's public key. Answers with an operator device session token, shown once.",
    method: "POST",
    path: "/auth/operator-device",
    output: "OperatorDeviceToken",
    public: true,
    mcp: false,
    input: object({ code: text("The code from the sign-in callback"), verifier: text("The PKCE verifier whose challenge started the sign-in"), platform: { enum: ["ios", "android"] }, device_name: text("The phone's own name, shown in the list of operator phones"), public_key: text("The phone's P-256 public key, base64: the uncompressed point (iOS) or its SubjectPublicKeyInfo (Android)") }, ["code", "verifier", "platform", "public_key"]),
    run: async ({ operatorDevices, instance, alerts }, input) => {
      if (!instance.surfaces.mobile_console) throw new ApiError(403, "This service doesn't offer its console on phones.", "mobile_console_off");
      const token = await operatorDevices.redeemCode({ code: str(input, "code"), verifier: str(input, "verifier"), deviceName: str(input, "device_name"), platform: input.platform === "android" ? "android" : "ios", publicKey: str(input, "public_key") });
      if (!token) throw new ApiError(400, "That sign-in expired, was already used, or came without a usable key. Sign in again.", "sign_in_expired");
      // Enrolling needs nothing from the web console, so every other operator's phone is told.
      alerts.phoneAdded(token.device.id);
      return token;
    },
  },
  {
    name: "delete_operator_device_session",
    description: "Native apps: sign this phone out of the console by ending the operator device session making the request.",
    method: "DELETE",
    path: "/auth/operator-device",
    output: "Deleted",
    mcp: false,
    input: object({}),
    run: async (context) => ({ deleted: await context.operatorDevices.end(operatorPhone(context)) }),
  },
  {
    name: "create_operator_challenge",
    description: "Native apps: ask for a nonce for the phone's key to sign, to unlock the console or to confirm one change. It is good once, for 60 seconds.",
    method: "POST",
    path: "/operator/device/challenge",
    output: "OperatorChallenge",
    mcp: false,
    input: object({ purpose: text("\"unlock\", or the name of the operation to confirm"), input_hash: text("For a change: base64url SHA-256 of the operation's whole input as canonical JSON (keys in order, no spacing)") }, ["purpose"]),
    run: async (context, input) => {
      const session = operatorPhone(context);
      const purpose = str(input, "purpose");
      if (purpose === "unlock") return context.operatorDevices.challenge(session, null);
      const operation = OPERATIONS.find((entry) => entry.name === purpose);
      if (operation?.mobile !== "confirm") throw new ApiError(400, "purpose is \"unlock\" or an operation a phone confirms.");
      const inputHash = str(input, "input_hash");
      if (!/^[\w-]{43}$/.test(inputHash)) throw new ApiError(400, "input_hash is the base64url SHA-256 of the operation's input.");
      return context.operatorDevices.challenge(session, { operation: operation.name, inputHash });
    },
  },
  {
    name: "unlock_operator_device_session",
    description: "Native apps: open the console on this phone for five minutes, with the phone's signature over an unlock nonce.",
    method: "POST",
    path: "/operator/device/unlock",
    output: "OperatorUnlock",
    mcp: false,
    input: object({ nonce: text("The nonce from create_operator_challenge"), signature: text("The phone key's signature, base64url DER, over \"livepeer-operator-unlock\\n<nonce>\"") }, ["nonce", "signature"]),
    run: async (context, input) => {
      const unlocked = await context.operatorDevices.unlock(operatorPhone(context), str(input, "nonce"), str(input, "signature"));
      if (!unlocked) throw new ApiError(401, "That wasn't this phone's signature over a fresh nonce.", "proof_required");
      return unlocked;
    },
  },
  { name: "list_prompt_starters", description: "List the starting points shown on Home, each with example requests.", method: "GET", path: "/starters", output: ["PromptStarter"], public: true, input: object({}), run: async ({ client }) => (await client.listPromptStarters()).data },
  { name: "list_showcase", description: "List the examples in the instance's gallery, each with the request that made it.", method: "GET", path: "/showcase", output: ["ShowcaseItem"], public: true, input: object({}), run: async ({ client }) => (await client.listShowcase()).data },
  { name: "list_agent_models", description: "List the language models the agent can run on, for the model menu.", method: "GET", path: "/agent-models", output: ["AgentModel"], public: true, input: object({}), run: async ({ client }) => (await client.listAgentModels()).data },
  { name: "list_agent_model_menu", description: "List the agent's model menu as the interface shows it: one row per language model, named and described, with the app to send as agent_model. Hidden when there are fewer than two rows.", method: "GET", path: "/agent-models/menu", output: ["AgentModelEntry"], public: true, input: object({}), run: async ({ agentModelMenu }) => agentModelMenu() },
  { name: "list_capability_labels", description: "List the readable name of each capability on offer and each model the agent can run on, as the interface shows it, with the model that does the work when known.", method: "GET", path: "/offerings/labels", output: ["CapabilityLabel"], public: true, input: object({}), run: async ({ labels }) => labels() },
  { name: "list_capabilities", description: "List the capabilities discovered on the network that this instance offers.", method: "GET", path: "/offerings", output: ["Offering"], public: true, input: object({}), run: async ({ client }) => (await client.listOfferings()).data },
  { name: "run_capability", description: "Run any discovered capability with a request body of your own.", method: "POST", path: "/run", output: "CapabilityRun", input: object({ app: text("Capability name from list_capabilities"), request: { type: "object", description: "The request body for the capability" } }, ["app"]), run: async ({ client }, input) => (await client.runCapability(str(input, "app"), input.request ?? {})).data },
  { name: "list_studio_mediums", description: "List the studio's mediums (video, image, audio) as the interface shows them: each one's modes, with the capability each mode runs and whether it is on offer, and its shapes, lengths and resolutions.", method: "GET", path: "/studio", output: ["StudioMedium"], public: true, input: object({}), run: async ({ studioMediums }) => studioMediums() },
  {
    name: "quote_generation",
    description: "What one result of a generation would cost in credits, before starting it.",
    method: "GET",
    path: "/generations/quote",
    output: "Quote",
    public: true,
    input: object({ kind: { enum: ["video", "image", "audio"] }, app: text("Capability to use"), duration_seconds: { type: ["number", "null"] }, resolution: { enum: ["720p", "1080p", null] } }, ["kind", "app"]),
    run: async ({ quote }, input) =>
      ({
        credits: quote({
          kind: input.kind as "video" | "image" | "audio",
          app: str(input, "app"),
          prompt: "",
          aspect: "16:9",
          duration_seconds: input.duration_seconds === undefined || input.duration_seconds === null || input.duration_seconds === "" ? null : Number(input.duration_seconds),
          resolution: input.resolution === "1080p" ? "1080p" : input.resolution === "720p" ? "720p" : null,
        }),
      }),
  },
  {
    name: "create_generation",
    description: "Generate a video, image or audio clip. Returns a job to poll with get_generation.",
    method: "POST",
    path: "/generations",
    output: "Generation",
    input: object(
      { kind: { enum: ["video", "image", "audio"] }, app: text("Capability to use, e.g. text-to-video"), prompt: text("What to make"), aspect, duration_seconds: { type: ["number", "null"] }, resolution: { enum: ["720p", "1080p", null] }, negative_prompt: text("What to leave out") },
      ["kind", "app", "prompt"],
    ),
    run: async ({ client }, input) =>
      (
        await client.createGeneration({
          kind: input.kind as "video" | "image" | "audio",
          app: str(input, "app"),
          prompt: str(input, "prompt"),
          aspect: (input.aspect as "16:9" | "9:16" | "1:1" | undefined) ?? "16:9",
          duration_seconds: typeof input.duration_seconds === "number" ? input.duration_seconds : input.kind === "image" ? null : 5,
          resolution: input.kind === "video" ? ((input.resolution as "720p" | "1080p" | undefined) ?? "720p") : null,
          ...(input.negative_prompt ? { negative_prompt: str(input, "negative_prompt") } : {}),
        })
      ).data,
  },
  { name: "get_generation", description: "Check a generation's state and progress.", method: "GET", path: "/generations/{id}", output: "Generation", input: object({ id: text("Generation id") }, ["id"]), run: async ({ client }, input) => found((await client.getGeneration(str(input, "id"))).data, "Generation") },
  { name: "list_conversations", description: "List the user's conversations with the agent, newest first.", method: "GET", path: "/conversations", output: ["ConversationSummary"], input: object({}), run: async ({ client }) => (await client.listConversations()).data },
  {
    name: "create_conversation",
    description: "Start a conversation with the agent. It plans the job, calls capabilities and reports each step.",
    method: "POST",
    path: "/conversations",
    output: "Conversation",
    input: object({ text: text("The request"), app: text("Optional capability to use"), aspect, duration_seconds: { type: "number", default: 5 }, attachment_ids: { type: "array", items: { type: "string" }, description: "Library item ids to work from" }, agent_model: text("Language model to run the agent, from list_agent_models; leave out to let the agent choose"), character_slug: text("A character to put on screen") }, ["text"]),
    run: async ({ client }, input) => (await client.createConversation(message(input))).data,
  },
  { name: "get_conversation", description: "Read a conversation, including the agent's steps, results and any video analysis.", method: "GET", path: "/conversations/{id}", output: "Conversation", input: object({ id: text("Conversation id") }, ["id"]), run: async ({ client }, input) => found((await client.getConversation(str(input, "id"))).data, "Conversation") },
  { name: "send_message", description: "Send a follow-up message in a conversation.", method: "POST", path: "/conversations/{id}/messages", output: "Conversation", input: object({ id: text("Conversation id"), text: text("The message"), app: text("Optional capability to use"), aspect, duration_seconds: { type: "number", default: 5 }, attachment_ids: { type: "array", items: { type: "string" } }, agent_model: text("Language model to run the agent; leave out to let the agent choose"), character_slug: text("A character to put on screen") }, ["id", "text"]), run: async ({ client }, input) => found((await client.sendMessage(str(input, "id"), message(input))).data, "Conversation") },
  { name: "delete_conversation", description: "Delete a conversation. Its shots stay in the library. This can't be undone.", method: "DELETE", path: "/conversations/{id}", output: "Deleted", input: object({ id: text("Conversation id") }, ["id"]), run: async ({ client }, input) => {
      if (!(await client.deleteConversation(str(input, "id"))).data) throw new ApiError(404, "Conversation not found");
      return { deleted: true };
    } },
  { name: "search_library", description: "Search the user's media by what is in it: subjects, places, actions, tags.", method: "GET", path: "/library", output: ["MediaItem"], input: object({ query: text("What to look for"), kind: { enum: ["video", "image", "audio"] } }), run: async ({ client }, input) => (await client.listMedia({ ...(input.query ? { query: str(input, "query") } : {}), ...(input.kind ? { kind: input.kind as "video" | "image" | "audio" } : {}) })).data },
  { name: "delete_media", description: "Delete an item from the library. This can't be undone.", method: "DELETE", path: "/library/{id}", output: "Deleted", input: object({ id: text("Library item id") }, ["id"]), run: async ({ client }, input) => ({ deleted: (await client.deleteMedia(str(input, "id"))).data }) },
  {
    name: "request_upload",
    description: "Ask to add a photo or video from the device to the library. Answers with where to send the file: PUT its bytes to `path` on this instance with the same sign-in, and the library item comes back.",
    method: "POST",
    path: "/uploads",
    output: "UploadTicket",
    // A file comes from a person's device; an agent attaches by library id or by link.
    mcp: false,
    input: object(
      {
        kind: { enum: ["image", "video"] },
        name: text("The file's name, which becomes the item's title"),
        content_type: text("The file's media type, such as image/jpeg or video/mp4"),
        size_bytes: { type: "number", description: "The file's size in bytes" },
        aspect: { enum: ["16:9", "9:16", "1:1"] },
      },
      ["kind", "name", "content_type", "size_bytes"],
    ),
    run: async ({ client }, input) => {
      if (input.kind !== "image" && input.kind !== "video") throw new ApiError(400, "Send kind as image or video.");
      const aspect = input.aspect === "16:9" || input.aspect === "9:16" || input.aspect === "1:1" ? input.aspect : undefined;
      try {
        return (await client.requestUpload({ kind: input.kind, name: str(input, "name"), content_type: str(input, "content_type"), size_bytes: Number(input.size_bytes), ...(aspect ? { aspect } : {}) })).data;
      } catch (cause) {
        throw uploadError(cause);
      }
    },
  },
  { name: "understand_video", description: "Ask about a video: summarise it, find moments, answer a question.", method: "POST", path: "/understand", output: "VideoAnalysis", input: object({ source: text("A URL or a library item id"), question: text("What to find out") }, ["source", "question"]), run: async ({ client }, input) => (await client.analyseVideo({ source: str(input, "source"), question: str(input, "question") })).data },
  {
    name: "list_characters",
    description: "List characters to cast in a scene: the person's own, then those shared on the instance. Characters for adults only aren't listed.",
    method: "GET",
    path: "/characters",
    output: ["Character"],
    public: true,
    input: object({ query: text("Filter by name, role or subject") }),
    run: async (context, input) => {
      const visible = await context.moderation.visible(context.account?.user.id ?? null);
      return (await context.client.listCharacters(input.query ? { query: str(input, "query") } : {})).data.filter(visible);
    },
  },
  { name: "get_character", description: "One character: who they are, how they open and who made them.", method: "GET", path: "/characters/{slug}", output: "Character", public: true, input: object({ slug: text("The character's slug") }, ["slug"]), run: async (context, input) => character(context, str(input, "slug")) },
  {
    name: "create_character",
    description: "Create a character to cast in scenes. It is private unless shared with everyone on the instance.",
    method: "POST",
    path: "/characters",
    output: "Character",
    input: object({
      name: { type: "string", maxLength: 40, description: "Their name" },
      tagline: { type: "string", maxLength: 80, description: "One line about them, shown under their name" },
      description: { type: "string", maxLength: 2000, description: "How they look, move and speak, and what they care about" },
      greeting: { type: "string", maxLength: 300, description: "The first thing they say in a new conversation" },
      visibility: { enum: ["private", "public"], default: "private" },
    }, ["name", "description", "greeting"]),
    run: async ({ client }, input) => {
      const field = (key: string, limit: number) => {
        const value = str(input, key).trim();
        if (value.length > limit) throw new ApiError(400, `${key} is longer than ${limit} characters.`);
        return value;
      };
      const name = field("name", 40);
      const description = field("description", 2000);
      const greeting = field("greeting", 300);
      if (!name || !description || !greeting) throw new ApiError(400, "A character needs a name, who they are and how they open.");
      return (await client.createCharacter({ name, tagline: field("tagline", 80), description, greeting, visibility: input.visibility === "public" ? "public" : "private", mature: false })).data;
    },
  },
  {
    name: "report_character",
    description: "Report a shared character to the instance's operator, with a reason.",
    method: "POST",
    path: "/characters/{slug}/report",
    output: "CharacterReport",
    input: object({ slug: text("The character's slug"), reason: { enum: [...REPORT_REASONS] }, note: { type: "string", maxLength: 500, description: "Anything to add, in your own words" } }, ["slug", "reason"]),
    run: async (context, input) => {
      const { user } = signedIn(context);
      const found = await shared(context, str(input, "slug"));
      const reason = REPORT_REASONS.find((entry) => entry === input.reason);
      if (!reason) throw new ApiError(400, `reason is one of ${REPORT_REASONS.join(", ")}.`);
      const waiting = async () => (await context.moderation.reports()).filter((entry) => entry.state === "open").length;
      const before = await waiting();
      const report = await context.moderation.report(user.id, found, reason, str(input, "note").trim().slice(0, 500) || null);
      // Changing one's own open report is not a new report, and tells nobody.
      const after = await waiting();
      if (after > before) context.alerts.reportFiled(after);
      return report;
    },
  },
  {
    name: "block_character",
    description: "Block a shared character: it, and everything else by its author, is hidden from the person from now on.",
    method: "POST",
    path: "/characters/{slug}/block",
    output: "CharacterBlock",
    input: object({ slug: text("The character's slug") }, ["slug"]),
    run: async (context, input) => context.moderation.block(signedIn(context).user.id, await shared(context, str(input, "slug"))),
  },
  { name: "get_account", description: "The user's plan, the plans and credit packs on offer, and what the payment provider supports.", method: "GET", path: "/account", output: "PlanAndCredits", input: object({}), run: async ({ client }) => (await client.getAccount()).data },
  { name: "get_preferences", description: "The user's settings: saving conversations, asking before spending, default shape and length, and adult content.", method: "GET", path: "/preferences", output: "Preferences", input: object({}), run: async ({ client }) => (await client.getPreferences()).data },
  {
    name: "update_preferences",
    description: "Change some of the user's settings. Adult content and the age confirmation can only be changed on the web, never from a phone.",
    method: "PATCH",
    path: "/preferences",
    output: "Preferences",
    input: object({
      saveChats: { type: "boolean", description: "Keep conversations" },
      confirmBeforeSpending: { type: "boolean", description: "Ask before spending credits in chat" },
      enterSends: { type: "boolean", description: "Enter sends a message on the web" },
      completionNotifications: { type: "boolean", description: "Say when a render finishes" },
      defaultAspect: { enum: ["16:9", "9:16", "1:1"] },
      defaultDuration: { type: "number", description: "Default length in seconds: 5, 10 or 15" },
      ageConfirmed: { type: "boolean", description: "Confirmed to be 18 or over (web only)" },
      adultContent: { type: "boolean", description: "Show adult content (web only)" },
    }),
    run: async (context, input) => {
      // App stores let adult content be switched on only on the website, so a phone can't change it.
      if (context.account?.deviceId && ("adultContent" in input || "ageConfirmed" in input)) throw new ApiError(403, "Adult content can only be changed on the web.", "web_only");
      return (await context.client.updatePreferences(preferencesPatch(input))).data;
    },
  },
  {
    name: "delete_account",
    description: "Delete the signed-in person's account, on their own request: their phones are signed out and their blocks forgotten. This can't be undone.",
    method: "DELETE",
    path: "/me",
    output: "Deleted",
    mcp: false,
    input: object({}),
    run: async (context) => {
      const { user } = signedIn(context);
      await context.client.deleteAccount();
      await context.devices.revokeAll(user.id);
      await context.operatorDevices.revokeUser(user.id, "account deleted");
      await context.moderation.forget(user.id);
      return { deleted: true };
    },
  },
  { name: "get_privacy", description: "Who can see a job on this instance: the instance operator and the compute operator, for each way of running it.", method: "GET", path: "/privacy", output: "PrivacyDescription", public: true, input: object({}), run: async ({ privacy }) => privacy() },
  { name: "get_balance", description: "The user's credit balance and budget.", method: "GET", path: "/balance", output: "CreditBalance", input: object({}), run: async ({ client }) => (await client.getCreditBalance()).data },
  { name: "get_usage", description: "What the user has spent, by capability, and recent jobs.", method: "GET", path: "/usage", output: "Usage", input: object({}), run: async ({ client }) => (await client.getUsage()).data },
  {
    name: "open_session",
    description: "Open a real-time session, such as a live restyle of a camera. It stays open and is billed by the second until closed.",
    method: "POST",
    path: "/sessions",
    output: "LiveSession",
    input: object({ app: text("A persistent capability, e.g. live-video-to-video"), prompt: text("The look or instruction"), destination_ids: { type: "array", items: { type: "string" } }, record: { type: "boolean", default: false } }, ["app", "prompt"]),
    run: async ({ client }, input) =>
      (await client.startLiveSession({ app: str(input, "app"), source: "camera", prompt: str(input, "prompt"), destination_ids: Array.isArray(input.destination_ids) ? input.destination_ids.map(String) : [], record: input.record === true })).data,
  },
  { name: "update_session", description: "Change a running session's prompt without closing it.", method: "PATCH", path: "/sessions/{id}", output: "LiveSession", input: object({ id: text("Session id"), prompt: text("The new look or instruction") }, ["id", "prompt"]), run: async ({ client }, input) => found((await client.updateLiveSession(str(input, "id"), str(input, "prompt"))).data, "Session") },
  { name: "close_session", description: "Close a real-time session.", method: "DELETE", path: "/sessions/{id}", output: "LiveSession", input: object({ id: text("Session id") }, ["id"]), run: async ({ client }, input) => found((await client.stopLiveSession(str(input, "id"))).data, "Session") },

  // Operator: administering the instance without the console.
  {
    name: "operator_status",
    description: "Operator: whether anything needs attention, today's figures and the state of the service, in one answer.",
    method: "GET",
    path: "/operator/status",
    output: "OperatorStatus",
    input: object({}),
    operator: true,
    mobile: "read",
    run: async (context) => status(operator(context), context.moderation),
  },
  { name: "operator_overview", description: "Operator: active users, jobs today, revenue, wholesale cost and margin.", method: "GET", path: "/operator/overview", output: "OverviewStats", input: object({}), operator: true, mobile: "read", run: async (context) => (await operator(context).getOverview()).data },
  { name: "operator_health", description: "Operator: engine readiness, discovery freshness, cost sync and version.", method: "GET", path: "/operator/health", output: "EngineHealth", input: object({}), operator: true, mobile: "read", run: async (context) => (await operator(context).getEngineHealth()).data },
  {
    name: "operator_list_users",
    description: "Operator: every account the engine knows, with its allocation. A query filters by name, label or id.",
    method: "GET",
    path: "/operator/users",
    output: ["KnownActor"],
    input: object({ query: text("Part of a name, label or id") }),
    operator: true,
    mobile: "read",
    run: async (context, input) => {
      const actors = (await operator(context).listActors()).data;
      const query = str(input, "query").trim().toLowerCase();
      return query ? actors.filter((actor) => [actor.name, actor.label, actor.actor_id].some((value) => value?.toLowerCase().includes(query))) : actors;
    },
  },
  {
    name: "operator_set_user_status",
    description: "Operator: suspend (pause) or resume a user's allocation. Suspending also signs out their phones and tablets, and ends any console session they have on a phone.",
    method: "POST",
    path: "/operator/users/{id}/status",
    output: "Done",
    input: object({ id: text("Actor id"), status: { enum: ["active", "paused"] }, tenant_id: { type: "string", default: "default" } }, ["id", "status"]),
    operator: true,
    mobile: "confirm",
    run: async (context, input) => {
      if (input.status !== "active" && input.status !== "paused") throw new ApiError(400, "status is active or paused.");
      const paused = input.status === "paused";
      const ok = (await operator(context).setActorStatus(str(input, "tenant_id") || "default", str(input, "id"), paused ? "paused" : "active")).data;
      // A suspended user's apps sign out on their next request.
      if (ok && paused) {
        await context.devices.revokeAll(str(input, "id"));
        await context.operatorDevices.revokeUser(str(input, "id"), "suspended");
      }
      return { ok };
    },
  },
  { name: "operator_top_up_user", description: "Operator: add credit to a user's allocation, as a one-off adjustment.", method: "POST", path: "/operator/users/{id}/top-up", input: object({ id: text("User id"), amount_usd: { type: "number", exclusiveMinimum: 0 } }, ["id", "amount_usd"]), operator: true, run: async (context, input) => operator(context).provider.budgets.topUpAllocation(str(input, "id"), { amount: Number(input.amount_usd).toFixed(2), currency: "USD" }) },
  { name: "operator_assign_plan", description: "Operator: assign a plan to a user, or remove it with a null plan_id.", method: "POST", path: "/operator/users/{id}/plan", input: object({ id: text("User id"), plan_id: { type: ["string", "null"] } }, ["id"]), operator: true, run: async (context, input) => ({ plan: await operator(context).provider.plans.assignPlan(str(input, "id"), typeof input.plan_id === "string" ? input.plan_id : null) }) },
  {
    name: "operator_list_jobs",
    description: "Operator: recent jobs across all users, newest first, with attempts and failures. Filter by state, and page back with the created_at of the last job seen.",
    method: "GET",
    path: "/operator/jobs",
    output: ["EngineJob"],
    input: object({ limit: { type: "number", default: 50 }, status: { enum: [...JOB_STATES] }, before: text("Only jobs created before this time (ISO 8601): the created_at of the last job on the page before") }),
    operator: true,
    mobile: "read",
    run: async (context, input) => {
      const limit = Math.min(Math.max(Math.trunc(Number(input.limit)) || 50, 1), 200);
      const state = JOB_STATES.find((entry) => entry === input.status);
      if (input.status !== undefined && input.status !== "" && !state) throw new ApiError(400, `status is one of ${JOB_STATES.join(", ")}.`);
      const before = input.before === undefined || input.before === "" ? null : Date.parse(str(input, "before"));
      if (before !== null && Number.isNaN(before)) throw new ApiError(400, "before is a time, such as 2026-11-21T09:00:00Z.");
      if (!state && before === null) return (await operator(context).listJobs(limit)).data;
      // The engine lists its newest jobs and takes no filter, so a filter or an earlier page is cut from its widest list.
      return (await operator(context).listJobs(JOBS_WINDOW)).data.filter((job) => (!state || job.state === state) && (before === null || Date.parse(job.created_at) < before)).slice(0, limit);
    },
  },
  { name: "operator_costs", description: "Operator: wholesale network cost by class and capability over a number of days.", method: "GET", path: "/operator/costs", output: "CostSummary", input: object({ days: { type: "number", default: 30 } }), operator: true, mobile: "read", run: async (context, input) => (await operator(context).getCostSummary(Number(input.days) || 30)).data },
  { name: "operator_list_reports", description: "Operator: reports of shared characters, open ones first.", method: "GET", path: "/operator/reports", input: object({}), output: ["CharacterReport"], operator: true, mobile: "read", run: async (context) => { operator(context); return context.moderation.reports(); } },
  {
    name: "operator_resolve_report",
    description: "Operator: decide a report. Dismiss leaves the character up; hide takes it off the instance for everyone.",
    method: "POST",
    path: "/operator/reports/{id}",
    output: "CharacterReport",
    input: object({ id: text("Report id"), outcome: { enum: ["dismissed", "hidden"] } }, ["id", "outcome"]),
    operator: true,
    mobile: "confirm",
    run: async (context, input) => {
      operator(context);
      if (input.outcome !== "dismissed" && input.outcome !== "hidden") throw new ApiError(400, "outcome is dismissed or hidden.");
      return found(await context.moderation.resolve(str(input, "id"), input.outcome === "hidden" ? "hidden" : "dismissed"), "Report");
    },
  },
  { name: "operator_list_grants", description: "Operator: grants and their funding.", method: "GET", path: "/operator/grants", output: ["Grant"], input: object({}), operator: true, mobile: "read", run: async (context) => operator(context).provider.budgets.listGrants() },
  { name: "operator_create_grant", description: "Operator: create a grant with initial funding.", method: "POST", path: "/operator/grants", input: object({ label: text("Grant name"), amount_usd: { type: "number", exclusiveMinimum: 0 } }, ["label", "amount_usd"]), operator: true, run: async (context, input) => operator(context).provider.budgets.createGrant({ label: str(input, "label"), amount: { amount: Number(input.amount_usd).toFixed(2), currency: "USD" } }) },
  { name: "operator_list_plans", description: "Operator: the provider's plans and allowances.", method: "GET", path: "/operator/plans", output: ["Plan"], input: object({}), operator: true, mobile: "read", run: async (context) => operator(context).provider.plans.listPlans() },
  { name: "operator_list_keys", description: "Operator: engine access keys.", method: "GET", path: "/operator/keys", input: object({}), operator: true, run: async (context) => (await operator(context).listAccessKeys()).data },
  { name: "operator_set_capability", description: "Operator: enable or disable a capability, set its markup or the surfaces it appears in.", method: "PATCH", path: "/operator/capabilities", input: object({ app: text("Capability name"), enabled: { type: "boolean" }, markup: { type: ["number", "null"] }, surfaces: { type: ["array", "null"], items: { type: "string" } } }, ["app"]), operator: true, run: async (context, input) => (await operator(context).updateCapabilitySetting(str(input, "app"), { ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}), ...(input.markup === null || typeof input.markup === "number" ? { markup: input.markup } : {}), ...(input.surfaces === null || Array.isArray(input.surfaces) ? { surfaces: input.surfaces === null ? null : input.surfaces.map(String) } : {}) })).data },
  { name: "operator_reset_capabilities", description: "Operator: put every capability back as this instance was deployed with it, forgetting what was enabled, disabled, priced or placed since.", method: "DELETE", path: "/operator/capabilities", output: "Deleted", input: object({}), operator: true, run: async (context) => ({ deleted: (await operator(context).resetCapabilitySettings()).data }) },
  { name: "operator_list_compute", description: "Operator: the compute operators that ran this instance's recent jobs, with their runners, failures and median response time.", method: "GET", path: "/operator/compute", output: ["ComputeOperator"], input: object({}), operator: true, mobile: "read", run: async (context) => (await operator(context).listComputeOperators()).data },
  {
    name: "operator_list_capabilities",
    description: "Operator: every capability discovered on the network, whether this instance offers it, its markup, and how many runners are ready.",
    method: "GET",
    path: "/operator/capabilities",
    output: ["OfferedCapability"],
    input: object({}),
    operator: true,
    mobile: "read",
    run: async (context): Promise<OfferedCapability[]> => {
      const client = operator(context);
      const [offerings, labels] = await Promise.all([client.listOfferings(), context.labels()]);
      const names = new Map(labels.map((label) => [label.app, label.name]));
      return Promise.all(
        offerings.data.map(async (offering) => {
          const setting = (await client.getCapabilitySetting(offering.app)).data;
          return { app: offering.app, name: names.get(offering.app) ?? offering.app, enabled: setting.enabled, markup: setting.markup, runner_count: offering.runner_count, ready_count: offering.ready_count, stale: offering.stale };
        }),
      );
    },
  },
  { name: "operator_list_devices", description: "Operator: the phones enrolled for the console, with who enrolled each, when it was last used and unlocked, and whether alerts reach it.", method: "GET", path: "/operator/devices", output: ["OperatorPhone"], input: object({}), operator: true, run: async (context) => { operator(context); return context.operatorDevices.list(); } },
  {
    name: "operator_get_alerts",
    description: "Operator, from the console on a phone: this phone's alerts. Whether the instance can send any to it, which kinds are on, and when they end.",
    method: "GET",
    path: "/operator/device/alerts",
    output: "OperatorAlerts",
    input: object({}),
    operator: true,
    mobile: "read",
    run: async (context) => {
      const session = operatorPhone(context);
      operator(context);
      return alertsOf(context, session, context.operatorDevices.alerts(session));
    },
  },
  {
    name: "operator_set_alerts",
    description: "Operator, from the console on a phone: choose which alerts reach this phone and where to send them. No kinds turns alerts off and forgets where the phone is reached.",
    method: "PUT",
    path: "/operator/device/alerts",
    output: "OperatorAlerts",
    input: object(
      {
        kinds: { type: "array", items: { enum: ALERT_CHOICES.map((choice) => choice.kind) }, description: "The kinds to switch on. Empty turns alerts off." },
        push_token: text("The address Apple or Google gave this phone for notifications. Needed unless kinds is empty."),
        environment: { enum: ["production", "development"], description: "iOS only: which of Apple's services issued push_token, from the build's aps-environment. Production unless said." },
      },
      ["kinds"],
    ),
    operator: true,
    mobile: "confirm",
    run: async (context, input) => {
      const session = operatorPhone(context);
      operator(context);
      const asked = Array.isArray(input.kinds) ? input.kinds : null;
      const kinds = ALERT_CHOICES.map((choice) => choice.kind).filter((kind) => asked?.includes(kind));
      if (!asked || kinds.length !== asked.length) throw new ApiError(400, `kinds is a list of ${ALERT_CHOICES.map((choice) => choice.kind).join(", ")}, each once.`);
      if (kinds.length === 0) return alertsOf(context, session, await context.operatorDevices.setAlerts(session, { kinds: [], pushToken: null, environment: "production" }));
      if (!await context.alerts.offered(session.platform)) throw new ApiError(409, "This service hasn't set up alerts for this kind of phone.", "alerts_not_offered");
      const pushToken = str(input, "push_token");
      if (!context.alerts.accepts(session.platform, pushToken)) throw new ApiError(400, "push_token isn't an address Apple or Google gives a phone.");
      const environment = session.platform === "ios" && input.environment === "development" ? "development" : "production";
      return alertsOf(context, session, await context.operatorDevices.setAlerts(session, { kinds, pushToken, environment }));
    },
  },
  {
    name: "operator_test_alert",
    description: "Operator, from the console on a phone: send this phone a test alert, to see that alerts reach it. Three an hour.",
    method: "POST",
    path: "/operator/device/alerts/test",
    output: "Done",
    input: object({}),
    operator: true,
    // It changes nothing, but it isn't a read: a phone's reads are GETs and everything else carries its own proof.
    mobile: "confirm",
    run: async (context) => {
      const session = operatorPhone(context);
      operator(context);
      const result = await context.alerts.test(session);
      if (result === "off") throw new ApiError(409, "Alerts are off on this phone.", "alerts_off");
      if (result === "limited") throw new ApiError(429, "Three test alerts an hour. Try again later.", "rate_limited");
      return { ok: result === "sent" };
    },
  },
  {
    name: "operator_revoke_device",
    description: "Operator: revoke one operator phone. Its console stops on its next request; the person's user app is not affected.",
    method: "DELETE",
    path: "/operator/devices/{id}",
    output: "Deleted",
    input: object({ id: text("Operator device session id, from operator_list_devices") }, ["id"]),
    operator: true,
    run: async (context, input) => {
      operator(context);
      if (!await context.operatorDevices.revoke(str(input, "id"), revoker(context))) throw new ApiError(404, "Operator phone not found");
      return { deleted: true };
    },
  },
  { name: "operator_revoke_all_devices", description: "Operator: revoke every operator phone at once. Each operator signs in again on their phone to get the console back.", method: "DELETE", path: "/operator/devices", output: "Deleted", input: object({}), operator: true, run: async (context) => { operator(context); return { deleted: await context.operatorDevices.revokeAll(revoker(context)) > 0 }; } },
  { name: "operator_list_audit", description: "Operator: what operators' phones did, were refused and were told, newest first: sign-ins, unlocks, changes, refusals, revocations and each alert sent.", method: "GET", path: "/operator/audit", output: ["OperatorAuditEntry"], input: object({ limit: { type: "number", default: 100 } }), operator: true, run: async (context, input) => { operator(context); return context.audit.list(Math.trunc(Number(input.limit)) || 100); } },
];

/** Failures in the last hour at or above this are worth an operator's attention. */
export const FAILING_JOBS = 5;
/** Cost sync older than this is late. */
const COST_SYNC_LATE_MS = 2 * 3600_000;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The sentences Status gives the things an operator's phone can be alerted to. Alerts are built from these
 * and nothing else, so a notification, the phone's Status screen and the web console say the same words.
 */
export const ATTENTION = {
  engineNotReady: "The engine isn't ready",
  jobsFailing: (failed: number) => `${plural(failed, "job", "jobs")} failed in the last hour`,
  reportsWaiting: (waiting: number) => (waiting === 1 ? "1 report is waiting" : `${waiting} reports are waiting`),
} as const;

/** How many of these jobs failed in the hour before `now`. */
export const failedInLastHour = (jobs: EngineJob[], now: number): number => jobs.filter((job) => job.state === "failed" && now - Date.parse(job.created_at) < 3600_000).length;

/** The widest list of jobs the engine is asked for when counting failures. */
export const FAILURES_WINDOW = JOBS_WINDOW;

/** What the Status screen shows. What counts as wrong is decided here, so the web and phones agree. */
async function status(client: OperatorClient, moderation: Moderation, now: number = Date.now()): Promise<OperatorStatus> {
  const [health, overview, jobs] = await Promise.all([client.getEngineHealth(), client.getOverview(), client.listJobs(JOBS_WINDOW)]);
  const service = health.data;
  const failedLastHour = failedInLastHour(jobs.data, now);
  const waiting = (await moderation.reports()).filter((report) => report.state === "open").length;
  const syncedAgo = service.cost_sync_at ? now - Date.parse(service.cost_sync_at) : null;
  const attention: OperatorAttention[] = [];
  if (!service.ready) attention.push({ kind: "engine_not_ready", message: ATTENTION.engineNotReady, count: null, opens: "status" });
  if (!service.discovery_fresh) attention.push({ kind: "discovery_stale", message: "Discovery is out of date", count: null, opens: "status" });
  if (service.cost_sync_error || syncedAgo === null || syncedAgo > COST_SYNC_LATE_MS) {
    const hours = syncedAgo === null ? null : Math.floor(syncedAgo / 3600_000);
    attention.push({ kind: "costs_not_synced", message: hours === null ? "Costs have never synced" : hours < 1 ? "Cost sync is failing" : `Costs haven't synced for ${hours} h`, count: hours, opens: "status" });
  }
  if (failedLastHour >= FAILING_JOBS) attention.push({ kind: "jobs_failing", message: ATTENTION.jobsFailing(failedLastHour), count: failedLastHour, opens: "jobs" });
  if (waiting > 0) attention.push({ kind: "reports_waiting", message: ATTENTION.reportsWaiting(waiting), count: waiting, opens: "reports" });
  return {
    checked_at: new Date(now).toISOString(),
    attention,
    today: { active_users: overview.data.active_users, jobs: overview.data.jobs_today, failed: overview.data.jobs_failed_today, revenue_usd: overview.data.revenue_usd, wholesale_usd: overview.data.wholesale_usd, margin_usd: overview.data.margin_usd, revenue_estimated: overview.data.revenue_estimated },
    service: { engine_ready: service.ready, discovery_fresh: service.discovery_fresh, discovery_observed_at: service.discovery_observed_at, cost_sync_at: service.cost_sync_at, cost_sync_error: service.cost_sync_error, running_jobs: service.running_jobs, engine_version: service.version },
  };
}

function message(input: Record<string, unknown>) {
  return {
    text: str(input, "text"),
    app: typeof input.app === "string" && input.app ? input.app : null,
    aspect: (input.aspect as "16:9" | "9:16" | "1:1" | undefined) ?? "16:9",
    duration_seconds: typeof input.duration_seconds === "number" ? input.duration_seconds : 5,
    ...(Array.isArray(input.attachment_ids) ? { attachment_ids: input.attachment_ids.map(String) } : {}),
    ...(typeof input.agent_model === "string" && input.agent_model ? { agent_model: input.agent_model } : {}),
    ...(typeof input.character_slug === "string" && input.character_slug ? { character_slug: input.character_slug } : {}),
  };
}

/**
 * The console session's own plumbing on a phone: enrolling, unlocking, asking for a nonce, signing out. They
 * aren't operator operations (the proof of who is asking is the session itself), and the native clients get
 * them in their operator client, beside the operator operations marked for phones.
 */
export const OPERATOR_SESSION_OPERATIONS: readonly string[] = ["create_operator_device_session", "delete_operator_device_session", "create_operator_challenge", "unlock_operator_device_session"];

/** Finds the operation for a REST request and extracts its path inputs. */
export function matchOperation(method: string, segments: string[]): { operation: Operation; params: Record<string, string> } | null {
  for (const operation of OPERATIONS) {
    if (operation.method !== method) continue;
    const pattern = operation.path.split("/").filter(Boolean);
    if (pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const matches = pattern.every((part, index) => {
      const segment = segments[index] as string;
      if (part.startsWith("{")) {
        params[part.slice(1, -1)] = decodeURIComponent(segment);
        return true;
      }
      return part === segment;
    });
    if (matches) return { operation, params };
  }
  return null;
}

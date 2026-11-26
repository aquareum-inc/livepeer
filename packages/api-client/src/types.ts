import type { WorkspaceRole } from "./provider/types";

/**
 * Types shaped on the engine's real responses (livepeer-builder `GET /v1/offerings`,
 * `GET /v1/allowance`). See docs/research/engine.md. Amounts are decimal strings.
 */

export type InteractionMode = "single-shot" | "persistent";

export interface RatePoint {
  amount: string;
  currency: string;
  unit: string;
  price_usd: string | null;
  source: string;
  observed_at: string;
  observed_by: string;
}

/** One row of `GET /v1/offerings`. Identity is (app, currency, unit). */
export interface Offering {
  app: string;
  modes: InteractionMode[];
  rate_low: RatePoint | null;
  rate_high: RatePoint | null;
  rate_status: string;
  stale: boolean;
  runner_count: number;
  ready_count: number;
  observed_at: string;
}

/** The model behind an app, read from its runners' descriptions. Media tools and other apps without a model have none. */
export interface AppModel {
  app: string;
  /** The model's id as its runners report it, e.g. `qwen3.8-27b`. Several runners with different models are joined with " or ". */
  model: string;
  /** The largest context any of its runners allows, in tokens; `null` when none say. */
  context_tokens: number | null;
}

/** A language model the agent can run on: one app serving it, with what the menu needs to show. */
export interface AgentModel {
  app: string;
  /** The model's id, e.g. `qwen3.8-27b`. */
  model: string;
  context_tokens: number | null;
  /** No runner is free right now, so a job would queue. */
  busy: boolean;
}

export interface EngineMoney {
  amount: string;
  currency: string;
}

/** `GET /v1/allowance`: an allocation's amounts as the provider reports them. */
export interface Allowance {
  allocation_id: string;
  /** The provider's own status string. */
  status: string;
  granted: EngineMoney | null;
  spent: EngineMoney | null;
  available: EngineMoney | null;
}

/** A user's budget in the provider's currency: what was granted, spent and is left. */
export interface BudgetSummary {
  granted: string;
  spent: string;
  available: string;
  currency: string;
}

/** A user's balance in credits: their allocation's available amount after the instance's markup rule. */
export interface CreditBalance {
  credits: number;
  allowance: BudgetSummary;
}

export type MediaKind = "video" | "image" | "audio";

/** Stand-in artwork for mocked media, until real outputs exist. */
export interface MockArtwork {
  hues: [number, number, number];
  seed: number;
}

/** An example in the instance's gallery. Instance content; no engine endpoint. */
export interface ShowcaseItem {
  id: string;
  kind: MediaKind;
  app: string;
  title: string;
  prompt: string;
  aspect: "16:9" | "9:16" | "1:1";
  duration_seconds: number | null;
  /** A still of the result, when there is one. Tiles without one show `artwork`. */
  image: string | null;
  artwork: MockArtwork;
}

export interface PromptStarter {
  id: string;
  label: string;
  app: string;
  examples: string[];
}

export type GenerationState = "queued" | "running" | "succeeded" | "failed";

export interface GenerationRequest {
  kind: MediaKind;
  app: string;
  prompt: string;
  aspect: "16:9" | "9:16" | "1:1";
  /** Video and audio only. */
  duration_seconds: number | null;
  /** Video only. */
  resolution: "720p" | "1080p" | null;
  negative_prompt?: string;
  /** Image-to-video only: the image the shot starts from, such as a character's portrait. */
  first_frame?: string;
}

/** An async generation job. Mocked: the engine's async jobs return 501 today. */
export interface Generation {
  id: string;
  state: GenerationState;
  progress: number;
  request: GenerationRequest;
  credits_charged: number;
  created_at: string;
  artwork: MockArtwork;
}

export type DataSource = "live" | "mock";

export type AgentStepState = "pending" | "running" | "done";

/** One thing the agent did: a decision, a tool call against a capability, or a review of its own output. */
export interface AgentStep {
  id: string;
  kind: "plan" | "tool" | "review";
  title: string;
  detail: string;
  /** The capability called, for tool and review steps. */
  app: string | null;
  state: AgentStepState;
}

export interface UserMessage {
  id: string;
  role: "user";
  text: string;
  /** The character the message asked to put on screen, if any. */
  cast: CharacterCast | null;
  /** The language model the user picked to run the agent; `null` was Auto. */
  agent_model: string | null;
  created_at: string;
}

export interface AgentMessage {
  id: string;
  role: "agent";
  state: "working" | "done";
  steps: AgentStep[];
  /** The reply, once the agent has finished. */
  text: string | null;
  /** Generations produced in this turn; each can be opened in the studio. */
  generation_ids: string[];
  /** Set when the turn analysed a video. */
  analysis: VideoAnalysis | null;
  elapsed_ms: number;
  created_at: string;
}

export type Message = UserMessage | AgentMessage;

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

export interface Conversation extends ConversationSummary {
  messages: Message[];
}

export interface SendMessageInput {
  text: string;
  /** Capability the user picked, or null to let the agent choose. */
  app: string | null;
  aspect: "16:9" | "9:16" | "1:1";
  duration_seconds: number;
  /** Library items attached to the message. */
  attachment_ids?: string[];
  /** A character to put on screen: its portrait is the first frame, its description how it behaves. */
  character_slug?: string;
  /** The language model that runs the agent for this message; absent lets the agent choose. */
  agent_model?: string;
}

/** Something in the user's library: an upload or a generation, with what the product understood about it. */
export interface MediaItem {
  id: string;
  kind: MediaKind;
  source: "generation" | "upload" | "recording";
  title: string;
  /** Automatic description, from a video understanding capability. */
  description: string;
  tags: string[];
  app: string | null;
  prompt: string | null;
  aspect: "16:9" | "9:16" | "1:1";
  duration_seconds: number | null;
  created_at: string;
  /** A still of the media, when there is one. Tiles without one show `artwork`. */
  image: string | null;
  artwork: MockArtwork;
  /** In a workspace's library, the name of the member who made or added it. Null in a personal library. */
  made_by: string | null;
}

/** What a client says about a file from the device before it sends it. */
export interface UploadRequest {
  kind: "image" | "video";
  /** The file's name, which becomes the library item's title. */
  name: string;
  content_type: string;
  size_bytes: number;
  /** The nearest of the three shapes, when the client knows it. */
  aspect?: "16:9" | "9:16" | "1:1";
}

/** Leave to send one file: where to PUT its bytes, and until when. */
export interface UploadTicket {
  id: string;
  /** Where to PUT the file, on this instance, with the same sign-in. The library item comes back. */
  path: string;
  max_bytes: number;
  expires_at: string;
}

/** A stored file, as it is served. */
export interface MediaFile {
  content_type: string;
  bytes: Uint8Array;
}

export interface Character {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** How the character opens a conversation. */
  greeting: string;
  author: string;
  visibility: "private" | "public";
  mature: boolean;
  /** Can take a live voice or video call. */
  calls: boolean;
  tags: string[];
  rating: number;
  chats: number;
  mine: boolean;
  /** A portrait, when there is one. Without one, `artwork` stands in with the name's initial. */
  image: string | null;
  artwork: MockArtwork;
}

/** Who a request puts on screen: just enough of a character to show and to start a shot from. */
export type CharacterCast = Pick<Character, "slug" | "name" | "image">;

export interface CharacterInput {
  name: string;
  tagline: string;
  description: string;
  greeting: string;
  visibility: "private" | "public";
  mature: boolean;
}

/** Who can see a job, per way of running the instance. The same words on every surface. */
export interface PrivacyTier {
  name: string;
  /** Set when the tier isn't plainly available, such as "Planned, not available". */
  status: string | null;
  summary: string;
  instance_sees: string;
  compute_sees: string;
}

/** How this instance treats what people make, in plain words. */
export interface PrivacyDescription {
  /** Whether the instance keeps prompts and outputs on its servers. */
  retains_chats: boolean;
  tiers: PrivacyTier[];
}

/** Why someone reported a character. */
export type ReportReason = "sexual" | "hateful" | "violent" | "impersonation" | "spam" | "other";

/** A report of a public character, as the operator reviews it. Who reported it is kept, never shown. */
export interface CharacterReport {
  id: string;
  character_slug: string;
  character_name: string;
  author: string;
  reason: ReportReason;
  /** What the person added in their own words. */
  note: string | null;
  created_at: string;
  /** Open until the operator acts: dismissed leaves the character up; hidden takes it off the instance. */
  state: "open" | "dismissed" | "hidden";
}

/** A character someone blocked: it, and everything else by its author, is hidden from them. */
export interface CharacterBlock {
  character_slug: string;
  author: string;
}

export interface ApiKey {
  id: string;
  label: string;
  /** First characters only; the full key is shown once, when created. */
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  status: "active" | "revoked";
  /** In a workspace, the name of the member who made the key. Null for a personal key. */
  created_by: string | null;
}

/** A key a bearer token belongs to, and the workspace whose credit it spends (null for a personal key). */
export interface VerifiedApiKey extends ApiKey {
  workspace_id: string | null;
}

export interface CreatedApiKey extends ApiKey {
  /** The full key. Returned once. */
  secret: string;
}

export interface Preferences {
  /** Confirmed to be 18 or over. Required before adult content can be switched on. */
  ageConfirmed: boolean;
  adultContent: boolean;
  saveChats: boolean;
  confirmBeforeSpending: boolean;
  enterSends: boolean;
  completionNotifications: boolean;
  defaultAspect: "16:9" | "9:16" | "1:1";
  defaultDuration: number;
}

export interface CapabilityRun {
  app: string;
  request: unknown;
  response: unknown;
  status: number;
  elapsed_ms: number;
  credits_charged: number;
}

/** A moment an understanding capability found in a video. */
export interface VideoMoment {
  at_seconds: number;
  label: string;
}

export interface VideoAnalysis {
  summary: string;
  moments: VideoMoment[];
  tags: string[];
}

/** A saved restyle for Live mode: a named prompt to switch to while on air. */
export interface LiveLook {
  id: string;
  name: string;
  prompt: string;
  artwork: MockArtwork;
}

export interface LiveDestination {
  id: string;
  platform: "youtube" | "twitch" | "custom";
  label: string;
  /** RTMP ingest URL. */
  url: string;
  /** Last four characters of the stream key; the key itself is never returned. */
  key_hint: string;
  enabled: boolean;
}

export interface LiveDestinationInput {
  platform: LiveDestination["platform"];
  label: string;
  url: string;
  stream_key: string;
}

export interface LiveSession {
  id: string;
  app: string;
  state: "live" | "ended";
  prompt: string;
  destination_ids: string[];
  recording: boolean;
  started_at: string;
  /** Set when the session ended and was recorded. */
  recording_media_id: string | null;
}

export interface LiveSessionInput {
  app: string;
  source: "camera" | "screen";
  prompt: string;
  destination_ids: string[];
  record: boolean;
}

export interface CharacterCall {
  id: string;
  character_slug: string;
  mode: "voice" | "video";
  state: "connected" | "ended";
  started_at: string;
}

/** An example app built on the real-time API. */
export interface ExampleApp {
  id: string;
  name: string;
  description: string;
  app: string;
  language: string;
  code: string;
  artwork: MockArtwork;
}

/** One reading of a live session's output stream. */
export interface LiveHealth {
  at: string;
  bitrate_kbps: number;
  fps: number;
  dropped_frames: number;
  /** Camera to restyled output. */
  latency_ms: number;
}

/** A way to sign in that an instance can offer. */
export type SignInMethodName = "email" | "passkey" | "google" | "apple" | "discord" | "coinbase" | "wallet";

/**
 * What a client needs to know about an instance before anyone signs in: how it looks, what it serves and
 * how to sign in. Read from the instance config, so there is no engine call behind it. URLs are absolute
 * and theme colours are sRGB hex, so a client that can't read CSS can use them as they are.
 */
export interface InstanceDescription {
  api_version: string;
  name: string;
  logo: {
    /** A square mark, or null to set the name's first letter in type. */
    symbol: string | null;
    /** The full logo, or null to set the name in type. */
    wordmark: string | null;
    /** Draw the marks in the text colour, using only their shape. */
    tint: boolean;
  };
  /** Overrides for colour tokens, per theme, keyed by token name ("primary"). Tokens not listed keep their default. */
  theme: { dark: Record<string, string>; light: Record<string, string> };
  surfaces: { app: boolean; console: boolean; api: boolean; mcp: boolean; mobile: boolean; mobile_console: boolean };
  /** The native apps built for this instance. Sign-in returns only to these; an app not listed can't sign in. */
  mobile: {
    ios: { bundle_id: string; minimum_version: string | null } | null;
    android: {
      application_id: string;
      minimum_version: string | null;
      /** What the Android app starts Firebase Cloud Messaging with, to be given an address for alerts. None of it is secret: it ships in every Android app. Null when the instance has none. */
      firebase: InstanceFirebase | null;
    } | null;
  };
  sign_in: { methods: SignInMethodName[]; sign_up: "open" | "invite" | "closed" };
  content: { characters: boolean; adult_content: boolean };
  home: {
    background_image: string | null;
    background_poster: string | null;
    background_video: string | null;
    /** Draw a live aurora over the background image. */
    aurora: boolean;
  };
}

/** The public values of a Firebase project, as its settings page gives them for one Android app. */
export interface InstanceFirebase {
  project_id: string;
  app_id: string;
  api_key: string;
  sender_id: string;
}

/** The signed-in user, as the account menu shows them. */
/** An account the signed-in person can work in: their own, or a workspace they belong to. */
export interface AccountSummary {
  id: string;
  kind: "personal" | "workspace";
  /** The workspace's name, or the person's own for their personal account. */
  name: string;
  /** The person's role in it. They are the owner of their personal account. */
  role: WorkspaceRole;
  credits: number;
  status: "active" | "paused";
  member_count: number;
}

/** An invitation to a workspace, as an app is told of it: what it is for and who sent it, never the link that answers it. */
export interface AccountInvitation {
  id: string;
  workspace_name: string;
  invited_by_name: string;
  role: Exclude<WorkspaceRole, "owner">;
  expires_at: string;
}

/** The accounts a person can work in from an app, which one they are in, and the invitations waiting for them. */
export interface AccountList {
  /** The id of the account every other call acts in. */
  current: string;
  /** Personal first, then workspaces by name. */
  accounts: AccountSummary[];
  invitations: AccountInvitation[];
  /** Whether the provider has workspaces at all. When false there is only ever the personal account. */
  workspaces_supported: boolean;
}

export interface Me {
  id: string;
  name: string;
  email: string | null;
  /** Whether the person runs this instance. An app offers the console from this; the server still decides every request. */
  role: "user" | "operator";
  /** The balance of the account they are working in. */
  balance: CreditBalance;
  /** The account they are working in: their own, or a workspace. Everything they see and make is that account's. */
  account: AccountSummary;
}

/** A phone or tablet signed in to the instance with its own revocable session. */
export interface DeviceSession {
  id: string;
  /** The device's own name, as it reported it ("Adam's iPhone"). */
  name: string;
  platform: "ios" | "android";
  created_at: string;
  last_used_at: string;
  /** The session making this request. */
  current: boolean;
}

/** A new device session. The token is shown once; the instance keeps only a keyed hash of it. */
export interface DeviceToken {
  token: string;
  device: DeviceSession;
}

/** An operator's phone enrolled for the console: its own session, bound to a key in the phone's secure hardware. */
export interface OperatorDeviceSession {
  id: string;
  /** Whose phone it is. */
  user_id: string;
  user_name: string;
  /** The phone's own name, as it reported it. */
  name: string;
  platform: "ios" | "android";
  created_at: string;
  last_used_at: string;
  /** When the phone last proved a face or fingerprint to open the console. */
  last_unlocked_at: string | null;
  /** When the session ends whatever its use, and the operator signs in again. */
  expires_at: string;
}

/** An operator's phone as the web console lists it: the session, and whether alerts reach it. */
export interface OperatorPhone extends OperatorDeviceSession {
  /** Off, on, or on but Apple or Google has said the phone can no longer be reached. */
  alerts: "off" | "on" | "not_reaching";
  /** When alerts end unless the phone signs in again. Null while they are off. */
  alerts_until: string | null;
  /** The console has idled out on this phone, so it must sign in again; alerts still reach it until they end. */
  signed_out: boolean;
}

/** Something an operator's phone can choose to be told about. The names are the ones Status uses. */
export type OperatorAlertKind = "engine_not_ready" | "jobs_failing" | "reports_waiting";

/** One choice on a phone's Alerts page, with the words for its switch. */
export interface OperatorAlertChoice {
  kind: OperatorAlertKind;
  /** "The engine stops being ready". */
  label: string;
  on: boolean;
}

/** Alerts on one operator's phone: whether the instance can send any, which are on, and until when. */
export interface OperatorAlerts {
  /** Whether this instance can send to this phone's platform at all. */
  offered: boolean;
  /** Off, on, or on but Apple or Google has said the phone can no longer be reached. */
  state: "off" | "on" | "not_reaching";
  kinds: OperatorAlertChoice[];
  /** When alerts end unless the phone signs in again. Null while they are off. */
  until: string | null;
  last_alert_at: string | null;
}

/** A new operator device session. The token is shown once; the instance keeps only a keyed hash of it. */
export interface OperatorDeviceToken {
  token: string;
  device: OperatorDeviceSession;
}

/** A value for the phone's key to sign, once, before it expires. */
export interface OperatorChallenge {
  nonce: string;
  expires_at: string;
}

/** The console is open on this phone until then. */
export interface OperatorUnlock {
  unlocked_until: string;
}

/** What an operator may do in the console. Whether the console opens at all is the session's `operator` role. */
export type OperatorRole = "owner" | "member" | "viewer";

/** One person on the team that runs the instance. */
export interface TeamOperator {
  user_id: string;
  name: string;
  email: string | null;
  role: OperatorRole;
  /**
   * How they came to be on the team: an invitation, added from the users list, the first owner's link from
   * setup, or the identity provider's own operator role, which the console can't change.
   */
  via: "invitation" | "added" | "setup" | "provider";
  /** The owner who invited or added them, by name. Null for the first owner and for someone from the provider. */
  added_by: string | null;
  since: string;
}

/** An invitation to the team that hasn't been used, revoked or run out. Its link is shown once, when it is made. */
export interface OperatorInvitation {
  id: string;
  role: OperatorRole;
  /** The owner who made it, by name. Null once they have left the team. */
  invited_by: string | null;
  created_at: string;
  expires_at: string;
}

/** The team, with the caller's own role in it. */
export interface OperatorTeam {
  role: OperatorRole;
  operators: TeamOperator[];
  invitations: OperatorInvitation[];
}

/** A new invitation, with the one sight of its link. */
export interface NewOperatorInvitation extends OperatorInvitation {
  /** The path to send, relative to the instance's address. */
  path: string;
}

/** One line of the record of what operators' phones did and were refused. */
export interface OperatorAuditEntry {
  id: string;
  at: string;
  event: "sign_in" | "sign_out" | "unlock" | "change" | "refused" | "revoked" | "alert";
  user_id: string;
  user_name: string;
  device_id: string | null;
  device_name: string | null;
  /** The operation asked for, when there was one. */
  operation: string | null;
  /** What it acted on: a user or report id. */
  target: string | null;
  /** Why it was refused or revoked, or how a change ended. */
  detail: string | null;
}

/** Something that needs the operator, as the Status screen lists it. */
export interface OperatorAttention {
  kind: "engine_not_ready" | "discovery_stale" | "costs_not_synced" | "jobs_failing" | "reports_waiting";
  /** The line to show: "3 reports are waiting". */
  message: string;
  count: number | null;
  /** Where to deal with it. */
  opens: "status" | "jobs" | "reports";
}

/** Whether anything is wrong, today's figures and the state of the service, in one answer. */
export interface OperatorStatus {
  checked_at: string;
  /** Empty when everything is running. */
  attention: OperatorAttention[];
  today: { active_users: number; jobs: number; failed: number; revenue_usd: number; wholesale_usd: number; margin_usd: number; revenue_estimated: boolean };
  service: {
    engine_ready: boolean;
    discovery_fresh: boolean;
    discovery_observed_at: string | null;
    cost_sync_at: string | null;
    cost_sync_error: string | null;
    running_jobs: number;
    engine_version: string;
  };
}

/**
 * One row of the agent's model menu: a language model, however many apps serve it. Named by the same rules
 * as the web's menu, so every client lists models the same way.
 */
export interface AgentModelEntry {
  /** The app to send as `agent_model`: the copy with a runner free and the most context. */
  app: string;
  /** Other apps serving the same model. */
  also: string[];
  /** The model's readable name, "Qwen3.8 27B". */
  name: string;
  /** What sets it apart, "128K context". */
  description: string;
  /** No runner is free right now, so a job would queue. */
  busy: boolean;
}

/** One way of working in a studio medium, resolved against what the network offers right now. */
export interface StudioMode {
  value: string;
  label: string;
  placeholder: string;
  /** The placeholder for clients that can't add this mode's inputs yet. */
  words_placeholder: string;
  /** The capability a draft in this mode runs: one on offer, or the usual one when none is. */
  app: string;
  /** Some compute operator offers it right now; without one, Generate stays off. */
  available: boolean;
  durations: number[] | null;
  /** The inputs the mode takes beside the words, such as "First frame". */
  inputs: string[];
  /** The mode only makes sense with an input (a source to edit, references to follow). */
  needs_input: boolean;
}

/** A studio medium as the interface shows it: its modes, its settings and what its empty stage says. */
export interface StudioMedium {
  kind: MediaKind;
  label: string;
  aspects: Array<"16:9" | "9:16" | "1:1"> | null;
  resolutions: Array<"720p" | "1080p"> | null;
  prompt_limit: number;
  /** How many results one Generate can make at once. */
  max_variants: number;
  modes: StudioMode[];
  empty: { title: string; body: string };
}

/** What one result of a draft would cost. */
export interface Quote {
  credits: number;
}

/** The answer to a change that has nothing else to say. */
export interface Done {
  ok: boolean;
}

/** The answer to a delete. */
export interface Deleted {
  deleted: boolean;
}

/** How a discovered app reads in the interface, so every client names it the same way. */
export interface CapabilityLabel {
  app: string;
  /** What it is: "Text to video", or a language model's name. */
  name: string;
  /** How it reads where it did a piece of work, with its model when known: "Text to image · FLUX.2 klein 4B". */
  work: string;
}

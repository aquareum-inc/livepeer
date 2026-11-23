import { isMockOnly, resolveSource } from "./data-sources";
import { agentModelsFrom, isLanguageApp } from "./runner-model";
import { listOfferingsLive, type EngineConfig } from "./live/engine";
import { createStoredKey, listStoredKeys, readStoredPreferences, revokeStoredKey, runStoredCapability, updateStoredPreferences, verifyStoredKey } from "./mock/account";
import { createStoredCharacter, listStoredCharacters, readStoredCharacter, type CharacterFilter } from "./mock/characters";
import {
  createStoredConversation,
  deleteStoredConversation,
  listStoredConversations,
  readStoredConversation,
  sendStoredMessage,
} from "./mock/conversations";
import { addGenerationToLibrary, addMediaToLibrary, deleteStoredMedia, listStoredMedia, type MediaFilter } from "./mock/library";
import { readStoredMediaFile, receiveStoredUpload, requestStoredUpload } from "./mock/uploads";
import {
  EXAMPLE_APPS,
  addStoredDestination,
  analyseStoredVideo,
  endStoredCall,
  listStoredDestinations,
  listStoredLooks,
  readStoredSessionHealth,
  removeStoredDestination,
  saveStoredLook,
  startStoredCall,
  startStoredSession,
  stopStoredSession,
  updateStoredSessionPrompt,
} from "./mock/live";
import { MOCK_AGENT_MODELS } from "./mock/agent-models";
import { MOCK_OFFERINGS } from "./mock/offerings";
import { MOCK_SHOWCASE, MOCK_STARTERS } from "./mock/showcase";
import type { ConversationHome } from "./mock/conversations";
import type { Owner } from "./mock/shared";
import { createStoredGeneration, generationOwner, latency, readStoredGeneration } from "./mock/store";
import { createMockProvider } from "./provider/mock";
import {
  balanceInCredits,
  topUpCredits,
  UnsupportedByProvider,
  type CreditPack,
  type MarkupRule,
  type Money,
  type PaymentProvider,
  type Plan,
  type ProviderFeatures,
  type UsageEntry,
  type UsageSummary,
  type Workspace,
  type WorkspaceInvitation,
  type WorkspaceMember,
  type WorkspaceRole,
} from "./provider/types";
import { NotAllowed, can, canChangeRole, canLeave, canRemoveMember, type AccountAction } from "./workspaces";
import type {
  AgentModel,
  ApiKey,
  AppModel,
  CapabilityRun,
  Character,
  CharacterCall,
  CharacterInput,
  Conversation,
  ConversationSummary,
  CreatedApiKey,
  CreditBalance,
  DataSource,
  Generation,
  ExampleApp,
  GenerationRequest,
  LiveDestination,
  LiveDestinationInput,
  LiveHealth,
  LiveLook,
  LiveSession,
  LiveSessionInput,
  MediaFile,
  MediaItem,
  Offering,
  Preferences,
  PromptStarter,
  SendMessageInput,
  ShowcaseItem,
  UploadRequest,
  UploadTicket,
  VerifiedApiKey,
  VideoAnalysis,
} from "./types";

/** The one key a mock-only instance accepts without it having been created. Never valid on a real instance. */
export const MOCK_ONLY_DEMO_KEY = "lpk_mock_only_demo_key";

export * from "./types";
export * from "./provider";
export { DATA_SOURCES, isMockOnly, resolveSource, type ApiFunctionName } from "./data-sources";
export { EngineError, type EngineConfig } from "./live/engine";
export { quoteCredits } from "./mock/store";
export { agentModelsFrom, appModel, runnerModel } from "./runner-model";
export * from "./operator";
export * from "./workspaces";
export type { CharacterFilter } from "./mock/characters";
export type { MediaFilter } from "./mock/library";
export { UPLOAD_RULES, UploadRefused } from "./mock/uploads";

/** A result plus where it came from, so dev mode can label each screen live or mocked. */
export interface Sourced<T> {
  data: T;
  source: DataSource;
}

/** The signed-in user's plan, what they could change to, and what the provider supports. */
export interface PlanAndCredits {
  plan: Plan | null;
  plans: Plan[];
  packs: CreditPack[];
  /** Top-ups of the user's own amount, or null when the provider can't take them or the operator turned them off. */
  top_up: { min: Money; max: Money; credits_per_usd: number } | null;
  provider: { id: string; name: string; features: ProviderFeatures };
}

/** What a user has spent: totals by capability, and their recent jobs. */
export interface Usage {
  summary: UsageSummary;
  entries: UsageEntry[];
}

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

/** Where the person can work, where they are working now, and the invitations waiting for them. */
export interface Accounts {
  /** The id of the account every other call acts in. */
  current: string;
  /** Personal first, then workspaces by name. */
  accounts: AccountSummary[];
  invitations: WorkspaceInvitation[];
  /** Whether the provider has workspaces at all. When false there is only ever the personal account. */
  workspaces_supported: boolean;
}

/** A member with what they used. The figures are null for other people when the reader may see only their own. */
export interface WorkspaceMemberRow extends WorkspaceMember {
  credits: number | null;
  jobs: number | null;
  last_used_at: string | null;
}

/** The workspace the person is working in, as their role lets them see it. */
export interface WorkspaceDetail {
  workspace: Workspace;
  role: WorkspaceRole;
  /** The reader's own user id, so a screen can mark "you". */
  viewer_id: string;
  members: WorkspaceMemberRow[];
  /** Invitations waiting for an answer. Empty for someone who can't manage members. */
  invitations: WorkspaceInvitation[];
}

/** One line of a workspace's usage by who caused it: a member, someone who has left, or an API key. */
export interface MemberUsageRow {
  kind: "member" | "former_member" | "key";
  id: string;
  /** The person's name, or the key's label. */
  name: string;
  role: WorkspaceRole | null;
  credits: number;
  jobs: number;
  last_used_at: string | null;
}

export interface ApiClient {
  /** The accounts the person can work in and the invitations waiting for them. */
  listAccounts(): Promise<Sourced<Accounts>>;
  createWorkspace(name: string): Promise<Sourced<Workspace>>;
  /** The current workspace, its members and invitations. Null in a personal account. */
  getWorkspace(): Promise<Sourced<WorkspaceDetail | null>>;
  renameWorkspace(name: string): Promise<Sourced<Workspace>>;
  /** Invites by email. Inviting an address already waiting renews its invitation. */
  inviteMember(input: { email: string; role: Exclude<WorkspaceRole, "owner"> }): Promise<Sourced<WorkspaceInvitation>>;
  revokeInvitation(invitationId: string): Promise<Sourced<boolean>>;
  /** What an invitation link is for. Null when the link is not a real one. */
  getInvitation(token: string): Promise<Sourced<WorkspaceInvitation | null>>;
  acceptInvitation(token: string): Promise<Sourced<Workspace>>;
  declineInvitation(token: string): Promise<Sourced<boolean>>;
  setMemberRole(userId: string, role: Exclude<WorkspaceRole, "owner">): Promise<Sourced<WorkspaceMember>>;
  removeMember(userId: string): Promise<Sourced<boolean>>;
  leaveWorkspace(): Promise<Sourced<boolean>>;
  transferOwnership(toUserId: string): Promise<Sourced<Workspace>>;
  /** The current workspace's usage by member and by API key. Owners and admins only. */
  getMemberUsage(): Promise<Sourced<MemberUsageRow[]>>;

  listOfferings(): Promise<Sourced<Offering[]>>;
  /** The language models the agent can run on, for the model menu on Home and in chat. */
  listAgentModels(): Promise<Sourced<AgentModel[]>>;
  runCapability(app: string, request: unknown): Promise<Sourced<CapabilityRun>>;
  listShowcase(): Promise<Sourced<ShowcaseItem[]>>;
  listPromptStarters(): Promise<Sourced<PromptStarter[]>>;

  createGeneration(request: GenerationRequest): Promise<Sourced<Generation>>;
  getGeneration(id: string): Promise<Sourced<Generation | null>>;

  listConversations(): Promise<Sourced<ConversationSummary[]>>;
  getConversation(id: string): Promise<Sourced<Conversation | null>>;
  createConversation(input: SendMessageInput): Promise<Sourced<Conversation>>;
  sendMessage(conversationId: string, input: SendMessageInput): Promise<Sourced<Conversation | null>>;
  deleteConversation(id: string): Promise<Sourced<boolean>>;

  listMedia(filter?: MediaFilter): Promise<Sourced<MediaItem[]>>;
  deleteMedia(id: string): Promise<Sourced<boolean>>;
  /** Checks a file from the device before it is sent, and answers with where to send it. */
  requestUpload(request: UploadRequest): Promise<Sourced<UploadTicket>>;
  /** Takes the file a ticket was given for and adds it to the library. Null when the ticket isn't good. */
  receiveUpload(id: string, bytes: Uint8Array): Promise<Sourced<MediaItem | null>>;
  /** The file behind a library item's still. */
  readMediaFile(id: string): Promise<Sourced<MediaFile | null>>;

  listCharacters(filter?: CharacterFilter): Promise<Sourced<Character[]>>;
  getCharacter(slug: string): Promise<Sourced<Character | null>>;
  createCharacter(input: CharacterInput): Promise<Sourced<Character>>;

  getCreditBalance(): Promise<Sourced<CreditBalance>>;
  getAccount(): Promise<Sourced<PlanAndCredits>>;
  buyCreditPack(packId: string): Promise<Sourced<CreditBalance>>;
  /** A one-off top-up of an amount the user chooses, within the operator's limits. */
  buyCredits(amount: Money): Promise<Sourced<CreditBalance>>;
  changePlan(planId: string | null): Promise<Sourced<Plan | null>>;
  getUsage(): Promise<Sourced<Usage>>;

  listApiKeys(): Promise<Sourced<ApiKey[]>>;
  createApiKey(label: string): Promise<Sourced<CreatedApiKey>>;
  revokeApiKey(id: string): Promise<Sourced<ApiKey | null>>;
  /** Checks a bearer token presented to the instance API. */
  verifyApiKey(secret: string): Promise<Sourced<VerifiedApiKey | null>>;

  getPreferences(): Promise<Sourced<Preferences>>;
  /** Deletes the signed-in user's account with the identity provider, on their own request. */
  deleteAccount(): Promise<Sourced<boolean>>;
  updatePreferences(patch: Partial<Preferences>): Promise<Sourced<Preferences>>;

  analyseVideo(input: { source: string; question: string }): Promise<Sourced<VideoAnalysis>>;

  listLiveLooks(): Promise<Sourced<LiveLook[]>>;
  saveLiveLook(input: { name: string; prompt: string }): Promise<Sourced<LiveLook>>;
  listLiveDestinations(): Promise<Sourced<LiveDestination[]>>;
  addLiveDestination(input: LiveDestinationInput): Promise<Sourced<LiveDestination>>;
  removeLiveDestination(id: string): Promise<Sourced<boolean>>;
  startLiveSession(input: LiveSessionInput): Promise<Sourced<LiveSession>>;
  updateLiveSession(id: string, prompt: string): Promise<Sourced<LiveSession | null>>;
  stopLiveSession(id: string): Promise<Sourced<LiveSession | null>>;
  getLiveHealth(id: string): Promise<Sourced<LiveHealth | null>>;

  startCall(characterSlug: string, mode: CharacterCall["mode"]): Promise<Sourced<CharacterCall>>;
  endCall(id: string): Promise<Sourced<CharacterCall | null>>;

  listExampleApps(): Promise<Sourced<ExampleApp[]>>;
}

export interface ApiClientOptions {
  engine?: EngineConfig;
  /**
   * Names the models behind apps, from their runners. Runner descriptions need a credential the
   * user's client doesn't hold, so the server supplies this; without it, apps are named from
   * their names alone.
   */
  describeApps?: (apps: string[]) => Promise<AppModel[]>;
  env?: Record<string, string | undefined>;
  /** Who the calls are made for. */
  user?: { id: string; name: string };
  /**
   * The workspace the person is working in, or null for their personal account. It decides whose credit,
   * plan, usage and keys the calls act on. The person's role in it is read from the provider on each call.
   */
  workspaceId?: string | null;
  /**
   * The caller is an API key, not a person. A workspace's key spends its credit and does nothing else, so it
   * is held to what a member may do without being looked up as one.
   */
  viaApiKey?: boolean;
  provider?: PaymentProvider;
  pricing?: MarkupRule;
  /**
   * Whether the instance offers a capability, as its operator has set. What it doesn't offer is left out of every
   * listing and refused when asked for by name. Defaults to everything on the network.
   */
  offers?: (app: string) => boolean;
}

/** A capability the instance doesn't offer was asked for by name. */
export class NotOffered extends Error {
  readonly app: string;

  constructor(app: string) {
    super(`${app} isn't offered here.`);
    this.name = "NotOffered";
    this.app = app;
  }
}

const DEFAULT_PRICING: MarkupRule = { creditsPerUsd: 100, default: 1.3 };
const DEMO_USER = { id: "usr_demo_adam", name: "Adam Soffer" };
let sharedMockProvider: PaymentProvider | null = null;

/**
 * The one mock provider a process uses, so the operator console and the user app see the same users,
 * plans and packs: a pack the operator adds is the one users are offered.
 */
export function mockProvider(): PaymentProvider {
  return (sharedMockProvider ??= createMockProvider());
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const env = options.env ?? process.env;
  const engine = options.engine;
  const user = options.user ?? DEMO_USER;
  const pricing = options.pricing ?? DEFAULT_PRICING;
  const provider = options.provider ?? mockProvider();
  const mock = <T>(data: T): Sourced<T> => ({ data, source: "mock" });
  const offers = options.offers ?? (() => true);
  const offered = <T extends { app: string }>(list: Sourced<T[]>): Sourced<T[]> => ({ ...list, data: list.data.filter((entry) => offers(entry.app)) });
  const mustOffer = (app: string | null | undefined): void => {
    if (app && !offers(app)) throw new NotOffered(app);
  };

  const workspaceId = options.workspaceId ?? null;
  /** The account that owns the credit, plan, usage and keys: the workspace, or the person. */
  const accountId = workspaceId ?? user.id;

  /** The person's role in the current account, from the provider. They own their personal account. */
  const role = async (): Promise<WorkspaceRole> => {
    if (!workspaceId) return "owner";
    if (options.viaApiKey) return "member";
    const member = (await provider.workspaces.listMembers(workspaceId)).find((entry) => entry.user_id === user.id);
    if (!member) throw new NotAllowed("You're not a member of this workspace.");
    return member.role;
  };
  const allow = async (action: AccountAction): Promise<WorkspaceRole> => {
    const mine = await role();
    if (!can(mine, action)) throw new NotAllowed();
    return mine;
  };
  /** For calls that only make sense in a workspace. */
  const inWorkspace = (): string => {
    if (!workspaceId) throw new Error("Switch to a workspace first.");
    return workspaceId;
  };
  /** Refuses work that would spend from a workspace the person has left or the operator has suspended. */
  const mustSpend = async (): Promise<void> => {
    if (!workspaceId) return;
    await allow("spend");
    if ((await provider.workspaces.get(workspaceId))?.status === "paused") throw new NotAllowed("This workspace is suspended, so nothing can be made in it for now.");
  };
  /** Whose the things made here are: the workspace's, by this person. Null in a personal account. */
  const owner: Owner | null = workspaceId ? { scope: workspaceId, by: user.name } : null;
  /** Chats in a workspace are each member's own. */
  const home: ConversationHome | null = workspaceId ? { scope: workspaceId, by: user.name, userId: user.id } : null;
  const creditsOf = async (id: string): Promise<number> => {
    const allocation = await provider.budgets.getAllocation(id);
    return allocation ? balanceInCredits(allocation, pricing) : 0;
  };

  const balance = async (): Promise<CreditBalance> => {
    const allocation = await provider.budgets.getAllocation(accountId);
    if (!allocation) {
      return { credits: 0, allowance: { granted: "0", spent: "0", available: "0", currency: "USD" } };
    }
    return {
      credits: balanceInCredits(allocation, pricing),
      allowance: {
        granted: allocation.granted.amount,
        spent: allocation.spent.amount,
        available: allocation.available.amount,
        currency: allocation.available.currency,
      },
    };
  };

  return {
    async listAccounts() {
      await latency(80, 160);
      const supported = provider.features.workspaces;
      const [memberships, invitations, personalCredits] = await Promise.all([
        supported ? provider.workspaces.listForUser(user.id) : [],
        supported ? provider.workspaces.listInvitationsForUser(user.id) : [],
        creditsOf(user.id),
      ]);
      const workspaces = await Promise.all(
        memberships.map(async ({ workspace, role: mine }): Promise<AccountSummary> => ({
          id: workspace.id,
          kind: "workspace",
          name: workspace.name,
          role: mine,
          credits: await creditsOf(workspace.id),
          status: workspace.status,
          member_count: workspace.member_count,
        })),
      );
      const personal: AccountSummary = { id: user.id, kind: "personal", name: user.name, role: "owner", credits: personalCredits, status: "active", member_count: 1 };
      return mock({
        // A workspace the person has since left is no longer theirs to work in.
        current: workspaces.some((entry) => entry.id === workspaceId) ? accountId : user.id,
        accounts: [personal, ...workspaces],
        invitations,
        workspaces_supported: supported,
      });
    },
    async createWorkspace(name) {
      if (!provider.features.workspaces) throw new UnsupportedByProvider(provider.name, "workspaces");
      await latency(300, 500);
      return mock(await provider.workspaces.create({ name, ownerId: user.id }));
    },
    async getWorkspace() {
      if (!workspaceId) return mock(null);
      await latency(120, 240);
      const mine = await role();
      const [workspace, members, usage, invitations] = await Promise.all([
        provider.workspaces.get(workspaceId),
        provider.workspaces.listMembers(workspaceId),
        provider.usage.getUsageByMember(workspaceId),
        can(mine, "manage_members") ? provider.workspaces.listInvitations(workspaceId) : [],
      ]);
      if (!workspace) return mock(null);
      const everyone = can(mine, "view_all_usage");
      return mock({
        workspace,
        role: mine,
        viewer_id: user.id,
        members: members.map((member) => {
          const used = everyone || member.user_id === user.id ? usage.find((row) => row.member_id === member.user_id) : undefined;
          return { ...member, credits: used?.credits ?? null, jobs: used?.jobs ?? null, last_used_at: used?.last_used_at ?? null };
        }),
        invitations,
      });
    },
    async renameWorkspace(name) {
      const id = inWorkspace();
      await allow("rename");
      await latency(200, 350);
      return mock(await provider.workspaces.rename(id, name));
    },
    async inviteMember({ email, role: invitedRole }) {
      const id = inWorkspace();
      await allow("manage_members");
      await latency(300, 500);
      return mock(await provider.workspaces.invite(id, { email, role: invitedRole, invitedBy: user.id }));
    },
    async revokeInvitation(invitationId) {
      const id = inWorkspace();
      await allow("manage_members");
      // Only an invitation to this workspace: an id from another one is not this admin's to cancel.
      if (!(await provider.workspaces.listInvitations(id)).some((entry) => entry.id === invitationId)) return mock(false);
      await latency(150, 300);
      await provider.workspaces.revokeInvitation(invitationId);
      return mock(true);
    },
    async getInvitation(token) {
      await latency(80, 160);
      return mock(await provider.workspaces.getInvitation(token));
    },
    async acceptInvitation(token) {
      await latency(300, 500);
      return mock((await provider.workspaces.acceptInvitation(token, user.id)).workspace);
    },
    async declineInvitation(token) {
      await latency(150, 300);
      await provider.workspaces.declineInvitation(token);
      return mock(true);
    },
    async setMemberRole(userId, nextRole) {
      const id = inWorkspace();
      const mine = await role();
      const target = (await provider.workspaces.listMembers(id)).find((entry) => entry.user_id === userId);
      if (!target) throw new Error("That person isn't a member of this workspace.");
      if (!canChangeRole(mine, target.role)) throw new NotAllowed();
      await latency(200, 350);
      return mock(await provider.workspaces.setMemberRole(id, userId, nextRole));
    },
    async removeMember(userId) {
      const id = inWorkspace();
      const mine = await role();
      if (userId === user.id) throw new Error("To go yourself, leave the workspace.");
      const target = (await provider.workspaces.listMembers(id)).find((entry) => entry.user_id === userId);
      if (!target) return mock(false);
      if (!canRemoveMember(mine, target.role)) throw new NotAllowed();
      await latency(200, 350);
      await provider.workspaces.removeMember(id, userId);
      return mock(true);
    },
    async leaveWorkspace() {
      const id = inWorkspace();
      if (!canLeave(await role())) throw new NotAllowed("Transfer the workspace to someone else before you leave it.");
      await latency(200, 350);
      await provider.workspaces.removeMember(id, user.id);
      return mock(true);
    },
    async transferOwnership(toUserId) {
      const id = inWorkspace();
      await allow("transfer_ownership");
      await latency(300, 500);
      return mock(await provider.workspaces.transferOwnership(id, toUserId));
    },
    async getMemberUsage() {
      const id = inWorkspace();
      await allow("view_all_usage");
      await latency(120, 240);
      const [rows, members, users] = await Promise.all([provider.usage.getUsageByMember(id), provider.workspaces.listMembers(id), provider.identity.listUsers()]);
      const keys = listStoredKeys(id);
      return mock(
        rows.map((row): MemberUsageRow => {
          const figures = { credits: row.credits, jobs: row.jobs, last_used_at: row.last_used_at };
          if (row.key_id) return { kind: "key", id: row.key_id, name: keys.find((key) => key.id === row.key_id)?.label ?? "API key", role: null, ...figures };
          const member = members.find((entry) => entry.user_id === row.member_id);
          if (member) return { kind: "member", id: member.user_id, name: member.name, role: member.role, ...figures };
          return { kind: "former_member", id: row.member_id ?? "", name: users.find((entry) => entry.id === row.member_id)?.name ?? "Former member", role: null, ...figures };
        }),
      );
    },

    async listAgentModels() {
      if (resolveSource("listAgentModels", env) === "live" && engine) {
        const offerings = await listOfferingsLive(engine);
        const languageApps = [...new Set(offerings.map((offering) => offering.app).filter(isLanguageApp))];
        const models = options.describeApps ? await options.describeApps(languageApps) : [];
        return offered({ data: agentModelsFrom(offerings, models), source: "live" });
      }
      await latency(80, 200);
      return offered(mock(MOCK_AGENT_MODELS.map((model) => ({ ...model }))));
    },

    async listOfferings() {
      if (resolveSource("listOfferings", env) === "live" && engine) {
        return offered({ data: await listOfferingsLive(engine), source: "live" });
      }
      await latency();
      return offered(mock(MOCK_OFFERINGS));
    },
    async runCapability(app, request) {
      mustOffer(app);
      await mustSpend();
      await latency(500, 900);
      return mock(runStoredCapability(app, request));
    },
    async listShowcase() {
      await latency();
      return mock(MOCK_SHOWCASE);
    },
    async listPromptStarters() {
      await latency(60, 120);
      return mock(MOCK_STARTERS);
    },

    async createGeneration(request) {
      mustOffer(request.app);
      await mustSpend();
      await latency(240, 480);
      return mock(createStoredGeneration(request, 0, owner));
    },
    async getGeneration(id) {
      await latency(60, 140);
      // A generation is read in the account it was made in.
      const madeIn = generationOwner(id);
      const generation = madeIn !== undefined && (madeIn?.scope ?? null) === workspaceId ? readStoredGeneration(id) : null;
      if (generation?.state === "succeeded") addGenerationToLibrary(generation, madeIn ?? null);
      return mock(generation);
    },

    async listConversations() {
      await latency(60, 140);
      return mock(listStoredConversations(home));
    },
    async getConversation(id) {
      await latency(60, 140);
      return mock(readStoredConversation(id, home));
    },
    async createConversation(input) {
      mustOffer(input.app);
      mustOffer(input.agent_model);
      await mustSpend();
      await latency(200, 380);
      return mock(createStoredConversation(input, home));
    },
    async sendMessage(conversationId, input) {
      mustOffer(input.app);
      mustOffer(input.agent_model);
      await mustSpend();
      await latency(200, 380);
      return mock(sendStoredMessage(conversationId, input, home));
    },
    async deleteConversation(id) {
      await latency(80, 160);
      return mock(deleteStoredConversation(id, home));
    },

    async listMedia(filter) {
      await latency(120, 260);
      return mock(listStoredMedia(filter, workspaceId));
    },
    async deleteMedia(id) {
      await latency(80, 160);
      return mock(deleteStoredMedia(id, workspaceId));
    },
    async requestUpload(request) {
      await latency(60, 140);
      return mock(requestStoredUpload(request, owner));
    },
    async receiveUpload(id, bytes) {
      await latency(120, 260);
      return mock(receiveStoredUpload(id, bytes));
    },
    async readMediaFile(id) {
      return mock(readStoredMediaFile(id));
    },

    async listCharacters(filter) {
      await latency(120, 260);
      return mock(listStoredCharacters(filter, workspaceId));
    },
    async getCharacter(slug) {
      await latency(80, 160);
      return mock(readStoredCharacter(slug, workspaceId));
    },
    async createCharacter(input) {
      await latency(200, 380);
      return mock(createStoredCharacter(input, user.name, workspaceId));
    },

    async getCreditBalance() {
      await latency(80, 160);
      return mock(await balance());
    },
    async getAccount() {
      await latency(120, 240);
      const [plan, plans, packs, range] = await Promise.all([
        provider.plans.getUserPlan(accountId),
        provider.plans.listPlans(),
        provider.plans.listCreditPacks(),
        provider.plans.getTopUpRange(),
      ]);
      return mock({
        plan,
        plans: plans.filter((entry) => entry.active),
        packs: packs.filter((entry) => entry.active),
        top_up: provider.features.custom_top_up && range.enabled ? { min: range.min, max: range.max, credits_per_usd: pricing.creditsPerUsd } : null,
        provider: { id: provider.id, name: provider.name, features: provider.features },
      });
    },
    async buyCreditPack(packId) {
      await allow("manage_billing");
      await latency(400, 700);
      const pack = (await provider.plans.listCreditPacks()).find((entry) => entry.id === packId && entry.active);
      if (!pack) throw new Error("That credit pack is no longer offered.");
      // A credit pack is a one-off top-up of the account's allocation.
      await provider.budgets.topUpAllocation(accountId, {
        amount: (pack.credits / pricing.creditsPerUsd).toFixed(2),
        currency: pack.price.currency,
      });
      return mock(await balance());
    },
    async buyCredits(amount) {
      await allow("manage_billing");
      await latency(400, 700);
      if (!provider.features.custom_top_up) throw new UnsupportedByProvider(provider.name, "top-ups of the user's own amount");
      const [range, packs] = await Promise.all([provider.plans.getTopUpRange(), provider.plans.listCreditPacks()]);
      const value = Number(amount.amount);
      if (!range.enabled) throw new Error("Top-ups of your own amount aren't offered here.");
      if (!(value >= Number(range.min.amount) && value <= Number(range.max.amount))) {
        throw new Error(`Choose an amount from ${range.min.amount} to ${range.max.amount} ${range.min.currency}.`);
      }
      // Like a pack, a one-off top-up of the user's allocation, at the rate of the largest pack it reaches.
      const credits = topUpCredits(value, packs, pricing.creditsPerUsd);
      await provider.budgets.topUpAllocation(accountId, { amount: (credits / pricing.creditsPerUsd).toFixed(2), currency: amount.currency });
      return mock(await balance());
    },
    async changePlan(planId) {
      await allow("manage_billing");
      await latency(400, 700);
      return mock(await provider.plans.assignPlan(accountId, planId));
    },
    async getUsage() {
      await latency(160, 320);
      // In a workspace, a member sees what they used themselves; owners and admins see all of it.
      const filter = { userId: accountId, ...(workspaceId && !can(await role(), "view_all_usage") ? { memberId: user.id } : {}) };
      const [summary, entries] = await Promise.all([provider.usage.getUsageSummary(filter), provider.usage.listUsage({ ...filter, limit: 25 })]);
      return mock({ summary, entries });
    },

    async listApiKeys() {
      await allow("manage_keys");
      await latency(100, 200);
      return mock(listStoredKeys(workspaceId));
    },
    async createApiKey(label) {
      await allow("manage_keys");
      await latency(250, 450);
      return mock(createStoredKey(label, owner));
    },
    async revokeApiKey(id) {
      await allow("manage_keys");
      await latency(200, 350);
      return mock(revokeStoredKey(id, workspaceId));
    },

    async verifyApiKey(secret) {
      // Mock-only instances accept one documented key, so tests, CI and development builds of the native
      // apps can call the API without a sign-in. It is refused whenever the instance isn't mock-only.
      if (isMockOnly(env) && secret === MOCK_ONLY_DEMO_KEY) {
        return mock({ id: "key_mock_only_demo", label: "Mock-only demo key", prefix: MOCK_ONLY_DEMO_KEY.slice(0, 8), created_at: "2026-11-19T00:00:00Z", last_used_at: null, status: "active", created_by: null, workspace_id: null });
      }
      return mock(verifyStoredKey(secret));
    },

    async deleteAccount() {
      await latency(300, 500);
      await provider.identity.deleteUser(user.id);
      return mock(true);
    },
    async getPreferences() {
      await latency(60, 120);
      return mock(readStoredPreferences(user.id));
    },
    async updatePreferences(patch) {
      await latency(120, 240);
      return mock(updateStoredPreferences(user.id, patch));
    },

    async analyseVideo({ source, question }) {
      await latency(900, 1600);
      return mock(analyseStoredVideo(source, question));
    },

    async listLiveLooks() {
      await latency(80, 160);
      return mock(listStoredLooks());
    },
    async saveLiveLook({ name, prompt }) {
      await latency(160, 300);
      return mock(saveStoredLook(name, prompt));
    },
    async listLiveDestinations() {
      await latency(80, 160);
      return mock(listStoredDestinations());
    },
    async addLiveDestination(input) {
      await latency(200, 360);
      return mock(addStoredDestination(input));
    },
    async removeLiveDestination(id) {
      await latency(120, 240);
      return mock(removeStoredDestination(id));
    },
    async startLiveSession(input) {
      await mustSpend();
      await latency(700, 1200);
      return mock(startStoredSession(input));
    },
    async updateLiveSession(id, prompt) {
      await latency(120, 260);
      return mock(updateStoredSessionPrompt(id, prompt));
    },
    async stopLiveSession(id) {
      await latency(300, 500);
      const stopped = stopStoredSession(id);
      if (stopped?.recording) addMediaToLibrary(stopped.recording, owner);
      return mock(stopped?.session ?? null);
    },

    async getLiveHealth(id) {
      return mock(readStoredSessionHealth(id));
    },

    async startCall(characterSlug, mode) {
      await mustSpend();
      await latency(900, 1500);
      return mock(startStoredCall(characterSlug, mode));
    },
    async endCall(id) {
      await latency(120, 240);
      return mock(endStoredCall(id));
    },

    async listExampleApps() {
      await latency(80, 160);
      return mock(EXAMPLE_APPS);
    },
  };
}

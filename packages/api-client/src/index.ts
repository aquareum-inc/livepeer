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
import { createStoredGeneration, latency, readStoredGeneration } from "./mock/store";
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
} from "./provider/types";
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

export interface ApiClient {
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
  verifyApiKey(secret: string): Promise<Sourced<ApiKey | null>>;

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

  const balance = async (): Promise<CreditBalance> => {
    const allocation = await provider.budgets.getAllocation(user.id);
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
      await latency(240, 480);
      return mock(createStoredGeneration(request));
    },
    async getGeneration(id) {
      await latency(60, 140);
      const generation = readStoredGeneration(id);
      if (generation?.state === "succeeded") addGenerationToLibrary(generation);
      return mock(generation);
    },

    async listConversations() {
      await latency(60, 140);
      return mock(listStoredConversations());
    },
    async getConversation(id) {
      await latency(60, 140);
      return mock(readStoredConversation(id));
    },
    async createConversation(input) {
      mustOffer(input.app);
      mustOffer(input.agent_model);
      await latency(200, 380);
      return mock(createStoredConversation(input));
    },
    async sendMessage(conversationId, input) {
      mustOffer(input.app);
      mustOffer(input.agent_model);
      await latency(200, 380);
      return mock(sendStoredMessage(conversationId, input));
    },
    async deleteConversation(id) {
      await latency(80, 160);
      return mock(deleteStoredConversation(id));
    },

    async listMedia(filter) {
      await latency(120, 260);
      return mock(listStoredMedia(filter));
    },
    async deleteMedia(id) {
      await latency(80, 160);
      return mock(deleteStoredMedia(id));
    },
    async requestUpload(request) {
      await latency(60, 140);
      return mock(requestStoredUpload(request));
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
      return mock(listStoredCharacters(filter));
    },
    async getCharacter(slug) {
      await latency(80, 160);
      return mock(readStoredCharacter(slug));
    },
    async createCharacter(input) {
      await latency(200, 380);
      return mock(createStoredCharacter(input, user.name));
    },

    async getCreditBalance() {
      await latency(80, 160);
      return mock(await balance());
    },
    async getAccount() {
      await latency(120, 240);
      const [plan, plans, packs, range] = await Promise.all([
        provider.plans.getUserPlan(user.id),
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
      await latency(400, 700);
      const pack = (await provider.plans.listCreditPacks()).find((entry) => entry.id === packId && entry.active);
      if (!pack) throw new Error("That credit pack is no longer offered.");
      // A credit pack is a one-off top-up of the user's allocation.
      await provider.budgets.topUpAllocation(user.id, {
        amount: (pack.credits / pricing.creditsPerUsd).toFixed(2),
        currency: pack.price.currency,
      });
      return mock(await balance());
    },
    async buyCredits(amount) {
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
      await provider.budgets.topUpAllocation(user.id, { amount: (credits / pricing.creditsPerUsd).toFixed(2), currency: amount.currency });
      return mock(await balance());
    },
    async changePlan(planId) {
      await latency(400, 700);
      return mock(await provider.plans.assignPlan(user.id, planId));
    },
    async getUsage() {
      await latency(160, 320);
      const [summary, entries] = await Promise.all([
        provider.usage.getUsageSummary({ userId: user.id }),
        provider.usage.listUsage({ userId: user.id, limit: 25 }),
      ]);
      return mock({ summary, entries });
    },

    async listApiKeys() {
      await latency(100, 200);
      return mock(listStoredKeys());
    },
    async createApiKey(label) {
      await latency(250, 450);
      return mock(createStoredKey(label));
    },
    async revokeApiKey(id) {
      await latency(200, 350);
      return mock(revokeStoredKey(id));
    },

    async verifyApiKey(secret) {
      // Mock-only instances accept one documented key, so tests, CI and development builds of the native
      // apps can call the API without a sign-in. It is refused whenever the instance isn't mock-only.
      if (isMockOnly(env) && secret === MOCK_ONLY_DEMO_KEY) {
        return mock({ id: "key_mock_only_demo", label: "Mock-only demo key", prefix: MOCK_ONLY_DEMO_KEY.slice(0, 8), created_at: "2026-11-19T00:00:00Z", last_used_at: null, status: "active" });
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
      if (stopped?.recording) addMediaToLibrary(stopped.recording);
      return mock(stopped?.session ?? null);
    },

    async getLiveHealth(id) {
      return mock(readStoredSessionHealth(id));
    },

    async startCall(characterSlug, mode) {
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

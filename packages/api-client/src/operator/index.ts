import { isMockOnly } from "../data-sources";
import { listOfferingsLive } from "../live/engine";
import { MOCK_OFFERINGS } from "../mock/offerings";
import { latency } from "../mock/store";
import type { Sourced } from "../index";
import type { PaymentProvider } from "../provider/types";
import type { Offering } from "../types";
import { read, write, type OperatorEngine } from "./live";
import {
  mockActors,
  setMockActorStatus,
  mockBilling,
  mockCostSummary,
  mockHealth,
  mockIsBlocked,
  mockIssueKey,
  mockJobs,
  mockKeys,
  mockPayments,
  mockRefund,
  mockRevokeKey,
  mockRunners,
  mockSetBlocked,
  mockUpdateBilling,
  mockWholesale,
} from "./mock";
import type {
  AccessKey,
  BillingSettings,
  CapabilitySetting,
  ComputeOperator,
  CostSummary,
  EngineHealth,
  EngineJob,
  KnownActor,
  OverviewStats,
  Payment,
  Runner,
} from "./types";

export * from "./types";
export type { OperatorEngine } from "./live";

/**
 * Which operator functions read the live engine. Reads use the reader token; writes use the
 * admin token. Everything else is mocked until the engine or provider supports it.
 */
export const OPERATOR_DATA_SOURCES = {
  getEngineHealth: "live",
  listOfferings: "live",
  listJobs: "live",
  listActors: "live",
  listAccessKeys: "live",
  getCostSummary: "live",
  listRunners: "live",
  issueAccessKey: "live",
  revokeAccessKey: "live",
  setActorStatus: "live",
  getOverview: "mock",
  listComputeOperators: "mock",
  setComputeOperatorBlocked: "mock",
  retryJob: "mock",
  listPayments: "mock",
  refundPayment: "mock",
  getBillingSettings: "mock",
  updateBillingSettings: "mock",
  getCapabilitySetting: "live",
  updateCapabilitySetting: "live",
} as const;

export interface OperatorClient {
  readonly provider: PaymentProvider;
  getEngineHealth(): Promise<Sourced<EngineHealth>>;
  listOfferings(): Promise<Sourced<Offering[]>>;
  listJobs(limit?: number): Promise<Sourced<EngineJob[]>>;
  retryJob(id: string): Promise<Sourced<EngineJob | null>>;
  listActors(): Promise<Sourced<KnownActor[]>>;
  setActorStatus(applicationId: string, actorId: string, status: "active" | "paused"): Promise<Sourced<boolean>>;
  listAccessKeys(): Promise<Sourced<AccessKey[]>>;
  issueAccessKey(input: { actor_id: string; label: string; kind: AccessKey["kind"] }): Promise<Sourced<{ key: AccessKey; token: string | null }>>;
  revokeAccessKey(keyId: string): Promise<Sourced<AccessKey | null>>;
  getCostSummary(days: number): Promise<Sourced<CostSummary>>;
  listRunners(app: string): Promise<Sourced<Runner[]>>;
  getOverview(): Promise<Sourced<OverviewStats>>;
  listComputeOperators(): Promise<Sourced<ComputeOperator[]>>;
  setComputeOperatorBlocked(orchestratorUrl: string, blocked: boolean): Promise<Sourced<boolean>>;
  listPayments(): Promise<Sourced<Payment[]>>;
  refundPayment(id: string): Promise<Sourced<Payment | null>>;
  getBillingSettings(): Promise<Sourced<BillingSettings>>;
  updateBillingSettings(patch: Partial<BillingSettings>): Promise<Sourced<BillingSettings>>;
  getCapabilitySetting(app: string): Promise<Sourced<CapabilitySetting>>;
  updateCapabilitySetting(app: string, patch: Partial<Omit<CapabilitySetting, "app">>): Promise<Sourced<CapabilitySetting>>;
}

/**
 * Where a capability's settings live: whether it's offered, where it appears and its markup. The app keeps
 * them in the instance config, which is what users are served and charged from, so a change made in the
 * console is what users get.
 */
export interface CapabilityStore {
  read(app: string): Omit<CapabilitySetting, "app">;
  /** Changes a capability's settings. Refuses a markup below 1. */
  write(app: string, patch: Partial<Omit<CapabilitySetting, "app">>): Promise<void>;
}

/** Capability settings held in memory, for tests and for clients with nowhere to save them. */
export function memoryCapabilityStore(initial: Record<string, Partial<Omit<CapabilitySetting, "app">>> = {}): CapabilityStore {
  const settings = new Map(Object.entries(initial));
  return {
    read: (app) => ({ enabled: true, markup: null, surfaces: null, ...settings.get(app) }),
    async write(app, patch) {
      if (patch.markup != null && !(patch.markup >= 1)) throw new Error("A markup can't be less than 1.");
      settings.set(app, { ...settings.get(app), ...patch });
    },
  };
}

export interface OperatorClientOptions {
  engine?: OperatorEngine;
  provider: PaymentProvider;
  env?: Record<string, string | undefined>;
  pricing: { creditsPerUsd: number; default: number };
  /** Defaults to memory. */
  capabilities?: CapabilityStore;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

export function createOperatorClient(options: OperatorClientOptions): OperatorClient {
  const { provider, pricing } = options;
  const capabilities = options.capabilities ?? memoryCapabilityStore();
  const engine = options.engine;
  const live = Boolean(engine) && !isMockOnly(options.env ?? process.env);
  const mock = <T>(data: T): Sourced<T> => ({ data, source: "mock" });
  const fromEngine = async <T>(call: (engine: OperatorEngine) => Promise<T>, fallback: () => T): Promise<Sourced<T>> => {
    if (live && engine) return { data: await call(engine), source: "live" };
    await latency(120, 260);
    return mock(fallback());
  };

  const jobs = (limit: number) => fromEngine((e) => read.jobs(e, limit), () => mockJobs(limit));

  const client: OperatorClient = {
    provider,
    getEngineHealth: () => fromEngine(read.health, mockHealth),
    async listOfferings() {
      if (live && engine) return { data: await listOfferingsLive({ url: engine.url }), source: "live" };
      await latency();
      return mock(MOCK_OFFERINGS);
    },
    listJobs: (limit = 50) => jobs(limit),
    async retryJob(id) {
      await latency(300, 600);
      const job = mockJobs(200).find((entry) => entry.id === id);
      return mock(job ? { ...job, state: "queued", failure: null, completed_at: null } : null);
    },
    listActors: () => fromEngine(read.actors, mockActors),
    async setActorStatus(applicationId, actorId, status) {
      if (live && engine) {
        await write.setAllocationStatus(engine, applicationId, actorId, status);
        return { data: true, source: "live" };
      }
      await latency(200, 400);
      if (provider.features.users) await provider.identity.setUserStatus(actorId, status);
      setMockActorStatus(actorId, status);
      return mock(true);
    },
    listAccessKeys: () => fromEngine(read.keys, mockKeys),
    async issueAccessKey(input) {
      if (live && engine) {
        const issued = await write.issueKey(engine, input);
        return { data: { key: issued.key, token: issued.token }, source: "live" };
      }
      await latency(250, 450);
      return mock(mockIssueKey(input));
    },
    async revokeAccessKey(keyId) {
      if (live && engine) return { data: await write.revokeKey(engine, keyId), source: "live" };
      await latency(200, 400);
      return mock(mockRevokeKey(keyId));
    },
    getCostSummary(days) {
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 3600_000);
      return fromEngine((e) => read.costs(e, start.toISOString(), end.toISOString()), () => mockCostSummary(start.toISOString(), end.toISOString()));
    },
    listRunners: (app) => fromEngine((e) => read.runners(e, app), () => mockRunners(app)),

    async getOverview() {
      // Retail revenue isn't known to the engine: it comes from the provider's usage. Until a
      // provider reports it, revenue is wholesale cost at the instance's default markup.
      const [list, costs] = await Promise.all([jobs(200), client.getCostSummary(1)]);
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const today = list.data.filter((job) => Date.parse(job.created_at) >= dayStart.getTime());
      const week = Date.now() - 7 * 24 * 3600_000;
      const usd = (cls: keyof CostSummary["by_class"]) => Number(costs.data.by_class[cls]?.fee_usd ?? 0);
      const wholesale = usd("delivered") + usd("failed_after_payment");
      const revenue = usd("delivered") * pricing.default;
      // Same terms as today's figures: users pay for delivered work, the network is paid for failed
      // work too. Earlier days are worked out per job; today is the cost summary itself, so the
      // chart's last bar and the cards above it always agree.
      const series = Array.from({ length: 14 }, (_, index) => {
        const day = new Date(dayStart.getTime() - (13 - index) * 24 * 3600_000);
        if (index === 13) return { day: day.toISOString().slice(0, 10), revenue_usd: revenue, wholesale_usd: wholesale };
        const next = day.getTime() + 24 * 3600_000;
        const that = list.data.filter((job) => Date.parse(job.created_at) >= day.getTime() && Date.parse(job.created_at) < next);
        const cost = (state: EngineJob["state"]) => that.filter((job) => job.state === state).reduce((total, job) => total + mockWholesale(job), 0);
        return { day: day.toISOString().slice(0, 10), revenue_usd: cost("succeeded") * pricing.default, wholesale_usd: cost("succeeded") + cost("failed") };
      });
      const stats: OverviewStats = {
        active_users: new Set(list.data.filter((job) => Date.parse(job.created_at) >= week).map((job) => job.actor_id)).size,
        jobs_today: today.length,
        jobs_failed_today: today.filter((job) => job.state === "failed").length,
        revenue_usd: revenue,
        wholesale_usd: wholesale,
        margin_usd: revenue - wholesale,
        pending_usd: usd("pending"),
        // Until the payment provider reports what users were charged.
        revenue_estimated: true,
        series,
      };
      return { data: stats, source: "mock" };
    },

    async listComputeOperators() {
      const list = await jobs(200);
      const byOperator = new Map<string, { apps: Set<string>; runners: Set<string>; jobs: number; failures: number; times: number[] }>();
      for (const job of list.data) {
        for (const attempt of job.attempts) {
          if (!attempt.orchestrator_url) continue;
          const row = byOperator.get(attempt.orchestrator_url) ?? { apps: new Set(), runners: new Set(), jobs: 0, failures: 0, times: [] };
          row.apps.add(job.app);
          if (attempt.runner_url) row.runners.add(attempt.runner_url);
          row.jobs += 1;
          if (attempt.outcome !== "succeeded" && attempt.outcome !== "in_flight") row.failures += 1;
          if (attempt.timings?.response_ms) row.times.push(attempt.timings.response_ms);
          byOperator.set(attempt.orchestrator_url, row);
        }
      }
      const operators: ComputeOperator[] = [...byOperator].map(([url, row]) => ({
        orchestrator_url: url,
        runners: row.runners.size,
        apps: [...row.apps].sort(),
        jobs: row.jobs,
        failures: row.failures,
        median_response_ms: median(row.times),
        status: mockIsBlocked(url) ? "blocked" : "allowed",
      }));
      return { data: operators.sort((a, b) => b.jobs - a.jobs), source: list.source === "live" ? "live" : "mock" };
    },
    async setComputeOperatorBlocked(orchestratorUrl, blocked) {
      await latency(200, 400);
      mockSetBlocked(orchestratorUrl, blocked);
      return mock(true);
    },

    async listPayments() {
      await latency(160, 320);
      return mock(mockPayments());
    },
    async refundPayment(id) {
      await latency(400, 700);
      return mock(mockRefund(id));
    },
    async getBillingSettings() {
      await latency(100, 200);
      return mock(mockBilling());
    },
    async updateBillingSettings(patch) {
      await latency(200, 400);
      return mock(mockUpdateBilling(patch));
    },
    async getCapabilitySetting(app) {
      return { data: { app, ...capabilities.read(app) }, source: "live" };
    },
    async updateCapabilitySetting(app, patch) {
      await capabilities.write(app, patch);
      return { data: { app, ...capabilities.read(app) }, source: "live" };
    },
  };
  return client;
}

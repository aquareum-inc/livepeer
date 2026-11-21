import { MOCK_OFFERINGS } from "../mock/offerings";
import type { AccessKey, BillingSettings, CostClass, CostSummary, EngineHealth, EngineJob, Fees, KnownActor, Payment, Runner } from "./types";

const USERS = ["usr_demo_adam", "usr_demo_sam", "usr_demo_ines", "usr_demo_tomas", "usr_demo_priya"];
const NAMES: Record<string, string> = {
  usr_demo_adam: "Adam Soffer",
  usr_demo_sam: "Sam Whitfield",
  usr_demo_ines: "Inés Castellanos",
  usr_demo_tomas: "Tomás Lindqvist",
  usr_demo_priya: "Priya Raman",
};
const ORCHESTRATORS = ["https://orch-ams-2.example.test:8935", "https://gpu.northfield.example.test:8935", "https://lpt-node-7.example.test:8935"];
const APPS = MOCK_OFFERINGS.filter((offering) => offering.modes.includes("single-shot")).map((offering) => offering.app);
const HOUR = 3600_000;
/** A fixed "now" keeps mocked history stable between requests on the same day. */
const anchor = () => Math.floor(Date.now() / HOUR) * HOUR;

const fees = (usd: number, rows = 1): Fees => ({ fee_eth: (usd / 3600).toFixed(9), fee_usd: usd.toFixed(6), row_count: rows });

export function mockJobs(limit = 60): EngineJob[] {
  const now = anchor();
  return Array.from({ length: limit }, (_, index) => {
    const app = APPS[(index * 7) % APPS.length] as string;
    const created = now - index * 0.37 * HOUR - (index % 5) * 240_000;
    const failed = index % 13 === 6;
    const running = index === 0;
    const duration = /video/.test(app) ? 9200 + (index % 4) * 1800 : 900 + (index % 6) * 260;
    const orchestrator = ORCHESTRATORS[index % ORCHESTRATORS.length] as string;
    const id = `0193${(4096 + index).toString(16)}-7c2e-7a10-9f3b-${(0xa1b2c3d4e5 + index * 977).toString(16).padStart(12, "0")}`;
    return {
      id,
      actor_id: USERS[index % USERS.length] as string,
      application_id: "default",
      operation_ref: null,
      mode: "immediate",
      app,
      capability: null,
      model: null,
      state: running ? "running" : failed ? "failed" : "succeeded",
      attempts: [
        {
          job_id: id,
          number: 1,
          runner_url: `${orchestrator}/apps/${app}`,
          orchestrator_url: orchestrator,
          allocation_id: `alc_${(USERS[index % USERS.length] as string).slice(9)}`,
          payment_sent: true,
          outcome: running ? "in_flight" : failed ? "unreachable" : "succeeded",
          status_code: running ? null : failed ? 502 : 200,
          started_at: new Date(created + 40).toISOString(),
          ended_at: running ? null : new Date(created + duration).toISOString(),
          timings: running ? null : { challenge_ms: 38 + (index % 9), signing_ms: 61 + (index % 14), response_ms: duration },
        },
      ],
      failure: failed
        ? { kind: "unreachable", message: "The runner closed the connection before answering.", status_code: 502, body: null, payment_sent: true, reason: null }
        : null,
      created_at: new Date(created).toISOString(),
      completed_at: running ? null : new Date(created + duration).toISOString(),
    };
  });
}

/**
 * Which mocked accounts are suspended. Held in memory, as the engine holds an allocation's status: suspending or
 * resuming one is seen by the next read, as it is on the live engine.
 */
const suspended = new Set<string>(["usr_demo_tomas"]);

export function setMockActorStatus(actorId: string, status: "active" | "paused"): void {
  if (status === "paused") suspended.add(actorId);
  else suspended.delete(actorId);
}

export function mockActors(): KnownActor[] {
  const now = anchor();
  return USERS.map((actor, index) => ({
    application_id: "default",
    actor_id: actor,
    label: NAMES[actor] ?? actor,
    name: null,
    allocation: {
      grant_id: index % 2 === 0 ? "grt_launch" : "grt_studio_partners",
      allocation_id: `alc_${actor.slice(9)}`,
      currency: "USD",
      status: suspended.has(actor) ? "paused" : "active",
      created_at: new Date(now - (60 - index * 9) * 24 * HOUR).toISOString(),
      updated_at: new Date(now - index * 5 * HOUR).toISOString(),
      label: NAMES[actor] ?? actor,
    },
    first_seen_at: new Date(now - (58 - index * 9) * 24 * HOUR).toISOString(),
    last_seen_at: new Date(now - index * 3.4 * HOUR).toISOString(),
    provisioned: true,
  }));
}

const keys: AccessKey[] = [
  { key_id: "key_01", kind: "admin", actor_id: "operator", application_id: "default", permissions: [], label: "console", created_at: "2026-08-19T08:40:00Z", revoked_at: null },
  { key_id: "key_02", kind: "auditor", actor_id: "console-reader", application_id: "default", permissions: [], label: "console reader", created_at: "2026-08-19T08:41:00Z", revoked_at: null },
  ...USERS.map((actor, index): AccessKey => ({
    key_id: `key_${String(index + 3).padStart(2, "0")}`,
    kind: "actor",
    actor_id: actor,
    application_id: "default",
    permissions: ["jobs.run", "jobs.read", "costs.read"],
    label: `${NAMES[actor]} · app`,
    created_at: new Date(Date.UTC(2026, 8, 2 + index * 9, 10)).toISOString(),
    revoked_at: null,
  })),
];
let keySequence = keys.length;

export const mockKeys = (): AccessKey[] => keys.map((key) => ({ ...key }));

export function mockIssueKey(input: { actor_id: string; label: string; kind: AccessKey["kind"] }): { key: AccessKey; token: string } {
  keySequence += 1;
  const key: AccessKey = {
    key_id: `key_${String(keySequence).padStart(2, "0")}`,
    kind: input.kind,
    actor_id: input.actor_id,
    application_id: "default",
    permissions: input.kind === "actor" ? ["jobs.run", "jobs.read", "costs.read"] : [],
    label: input.label,
    created_at: new Date().toISOString(),
    revoked_at: null,
  };
  keys.unshift(key);
  const body = Array.from({ length: 36 }, (_, index) => "abcdefghjkmnpqrstuvwxyz23456789"[(index * 13 + keySequence * 29) % 31]).join("");
  return { key: { ...key }, token: `lpk_${body}` };
}

export function mockRevokeKey(keyId: string): AccessKey | null {
  const key = keys.find((entry) => entry.key_id === keyId);
  if (!key) return null;
  key.revoked_at = new Date().toISOString();
  return { ...key };
}

/** Wholesale cost per job, in USD, as the engine would observe it. */
export function mockWholesale(job: EngineJob): number {
  const offering = MOCK_OFFERINGS.find((entry) => entry.app === job.app);
  const low = Number(offering?.rate_low?.price_usd ?? 0.01);
  return offering?.rate_low?.unit === "seconds" ? low * 12 : low;
}

export function mockCostSummary(start: string, end: string): CostSummary {
  const jobs = mockJobs(200).filter((job) => job.created_at >= start && job.created_at < end);
  const empty = (): Record<CostClass, number> => ({ delivered: 0, failed_after_payment: 0, uncertain: 0, pending: 0 });
  const totals = empty();
  const byApp = new Map<string, Record<CostClass, number>>();
  for (const job of jobs) {
    const cls: CostClass = job.state === "running" ? "pending" : job.state === "failed" ? "failed_after_payment" : "delivered";
    const usd = mockWholesale(job);
    totals[cls] += usd;
    const row = byApp.get(job.app) ?? empty();
    row[cls] += usd;
    byApp.set(job.app, row);
  }
  const toFees = (row: Record<CostClass, number>) =>
    Object.fromEntries((Object.keys(row) as CostClass[]).map((cls) => [cls, fees(row[cls])])) as Record<CostClass, Fees>;
  return {
    start,
    end,
    by_class: toFees(totals),
    jobs_with_cost: jobs.filter((job) => job.state !== "running").length,
    jobs_pending: jobs.filter((job) => job.state === "running").length,
    by_app: Object.fromEntries([...byApp].map(([app, row]) => [app, toFees(row)])),
  };
}

export function mockHealth(): EngineHealth {
  return {
    ready: true,
    discovery_fresh: true,
    discovery_observed_at: new Date(Date.now() - 21_000).toISOString(),
    discovery_error: null,
    cost_sync_at: new Date(Date.now() - 140_000).toISOString(),
    cost_sync_error: null,
    running_jobs: 1,
    allocation_mode: "per_actor",
    version: "mock",
  };
}

/** Runner descriptions in the shape the live engine returns (the standard envelope). */
const envelope = (name: string, source: string, limits?: { context_tokens: number }) => JSON.stringify({ runner_contract: 1, model: { name, source }, ...(limits ? { limits } : {}) });
const MOCK_RUNNER_METADATA: Record<string, string> = {
  chat: envelope("qwen3.8-27b", "hf:Qwen/Qwen3.8-27B-AWQ", { context_tokens: 32768 }),
  "text-to-video": envelope("Wan-AI/Wan2.2-T2V-A14B", "hf:Wan-AI/Wan2.2-T2V-A14B"),
  "image-to-video": envelope("Wan-AI/Wan2.2-I2V-A14B", "hf:Wan-AI/Wan2.2-I2V-A14B"),
  "text-to-image": envelope("black-forest-labs/FLUX.2-klein-4B", "hf:black-forest-labs/FLUX.2-klein-4B"),
  "image-edit": envelope("ZhengPeng7/BiRefNet", "hf:ZhengPeng7/BiRefNet"),
  music: envelope("ACE-Step/Ace-Step1.5", "hf:ACE-Step/Ace-Step1.5"),
  "text-to-speech": envelope("kokoro", "hf:hexgrad/Kokoro-82M"),
  transcription: envelope("openai/whisper-large-v3-turbo", "hf:openai/whisper-large-v3-turbo"),
};

export function mockRunners(app: string): Runner[] {
  const offering = MOCK_OFFERINGS.find((entry) => entry.app === app);
  if (!offering) return [];
  return Array.from({ length: offering.runner_count }, (_, index) => {
    const orchestrator = ORCHESTRATORS[index % ORCHESTRATORS.length] as string;
    return {
      url: `${orchestrator}/apps/${app}/${index + 1}`,
      app,
      runner_id: `${app}-${index + 1}`,
      mode: offering.modes[0] ?? null,
      orchestrator_url: orchestrator,
      capacity: 2,
      capacity_available: index < offering.ready_count ? 1 + (index % 2) : 0,
      rate: offering.rate_low ? { amount: offering.rate_low.amount, currency: "wei", unit: offering.rate_low.unit, price_usd: offering.rate_low.price_usd } : null,
      rate_error: null,
      observed_at: offering.observed_at,
      version: "0.3.0",
      gpu: { id: `GPU-${index}`, name: index % 2 === 0 ? "NVIDIA RTX 4090" : "NVIDIA L40S", vram_mb: index % 2 === 0 ? 24564 : 46068 },
      metadata: MOCK_RUNNER_METADATA[app] ?? null,
    };
  });
}

const payments: Payment[] = [
  { id: "pay_9f31", user_id: "usr_demo_ines", user_name: "Inés Castellanos", description: "Studio plan, November", amount: { amount: "68.00", currency: "USD" }, status: "paid", created_at: "2026-11-11T16:22:00Z", invoice_id: "inv_2026_0412" },
  { id: "pay_9e80", user_id: "usr_demo_priya", user_name: "Priya Raman", description: "Creator plan, November", amount: { amount: "18.00", currency: "USD" }, status: "paid", created_at: "2026-11-05T13:47:00Z", invoice_id: "inv_2026_0398" },
  { id: "pay_9e12", user_id: "usr_demo_adam", user_name: "Adam Soffer", description: "2,500 credits", amount: { amount: "25.00", currency: "USD" }, status: "paid", created_at: "2026-11-03T09:10:00Z", invoice_id: "inv_2026_0391" },
  { id: "pay_9d77", user_id: "usr_demo_tomas", user_name: "Tomás Lindqvist", description: "Creator plan, November", amount: { amount: "18.00", currency: "USD" }, status: "failed", created_at: "2026-10-28T09:05:00Z", invoice_id: null },
  { id: "pay_9c05", user_id: "usr_demo_ines", user_name: "Inés Castellanos", description: "Studio plan, October", amount: { amount: "68.00", currency: "USD" }, status: "paid", created_at: "2026-10-11T16:22:00Z", invoice_id: "inv_2026_0344" },
];

export const mockPayments = (): Payment[] => payments.map((payment) => ({ ...payment }));

export function mockRefund(paymentId: string): Payment | null {
  const payment = payments.find((entry) => entry.id === paymentId);
  if (!payment || payment.status !== "paid") return null;
  payment.status = "refunded";
  return { ...payment };
}

let billing: BillingSettings = { processor: { connected: false, name: null }, currency: "USD", collect_tax: false, tax_region: null };
export const mockBilling = (): BillingSettings => ({ ...billing, processor: { ...billing.processor } });
export function mockUpdateBilling(patch: Partial<BillingSettings>): BillingSettings {
  billing = { ...billing, ...patch };
  return mockBilling();
}

const blocked = new Set<string>();
export const mockIsBlocked = (orchestrator: string) => blocked.has(orchestrator);
export function mockSetBlocked(orchestrator: string, value: boolean): void {
  if (value) blocked.add(orchestrator);
  else blocked.delete(orchestrator);
}

export const mockUserName = (actor: string) => NAMES[actor] ?? actor;

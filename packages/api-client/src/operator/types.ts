/** Operator-side types. The engine shapes are as documented in docs/research/engine.md §4. */

export type JobState = "queued" | "running" | "succeeded" | "failed" | "uncertain";
export type CostClass = "delivered" | "failed_after_payment" | "uncertain" | "pending";

export interface Fees {
  fee_eth: string;
  fee_usd: string | null;
  row_count: number;
}

export interface JobAttempt {
  job_id: string;
  number: number;
  runner_url: string | null;
  orchestrator_url: string | null;
  allocation_id: string | null;
  payment_sent: boolean;
  outcome: string;
  status_code: number | null;
  started_at: string;
  ended_at: string | null;
  timings: { challenge_ms: number | null; signing_ms: number | null; response_ms: number | null } | null;
}

export interface JobFailure {
  kind: string;
  message: string;
  status_code: number | null;
  body: string | null;
  payment_sent: boolean;
  reason: string | null;
}

/** `GET /v1/jobs` item. */
export interface EngineJob {
  id: string;
  actor_id: string;
  application_id: string;
  operation_ref: string | null;
  mode: "immediate" | "async";
  app: string;
  capability: string | null;
  model: string | null;
  state: JobState;
  attempts: JobAttempt[];
  failure: JobFailure | null;
  created_at: string;
  completed_at: string | null;
}

/** `GET /v1/admin/actors` item. */
export interface KnownActor {
  application_id: string;
  actor_id: string;
  label: string;
  name: string | null;
  allocation: {
    grant_id: string;
    allocation_id: string;
    currency: string;
    status: "active" | "paused" | "exhausted" | "revoked";
    created_at: string;
    updated_at: string;
    label: string;
  } | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  provisioned: boolean;
}

/** `GET /v1/admin/keys` item. */
export interface AccessKey {
  key_id: string;
  kind: "actor" | "admin" | "auditor" | "service";
  actor_id: string;
  application_id: string;
  permissions: string[];
  label: string;
  created_at: string;
  revoked_at: string | null;
}

/** `GET /v1/costs/summary`. */
export interface CostSummary {
  start: string;
  end: string;
  by_class: Record<CostClass, Fees>;
  jobs_with_cost: number;
  jobs_pending: number;
  by_app: Record<string, Partial<Record<CostClass, Fees>>>;
}

/** `GET /readyz`. */
export interface EngineHealth {
  ready: boolean;
  discovery_fresh: boolean;
  discovery_observed_at: string | null;
  discovery_error: string | null;
  cost_sync_at: string | null;
  cost_sync_error: string | null;
  running_jobs: number;
  allocation_mode: string;
  version: string;
}

/** `GET /v1/runners?app=` item, as the running engine (15142129e) returns it. */
export interface Runner {
  url: string;
  app: string;
  runner_id: string | null;
  mode: string | null;
  orchestrator_url: string | null;
  capacity: number | null;
  capacity_available: number | null;
  rate: { amount: string; currency: string; unit: string; price_usd: string | null } | null;
  rate_error: string | null;
  observed_at: string | null;
  version: string | null;
  gpu: { id: string | null; name: string | null; vram_mb: number | null } | null;
  /** The runner's own description, as JSON in a string. Its shape varies by runner; read it with `runnerModel`. */
  metadata: string | null;
}

/** An operator's view of one compute operator, derived from the jobs it served. */
export interface ComputeOperator {
  orchestrator_url: string;
  runners: number;
  apps: string[];
  jobs: number;
  failures: number;
  median_response_ms: number | null;
  status: "allowed" | "blocked";
}

export interface Payment {
  id: string;
  user_id: string;
  user_name: string;
  description: string;
  amount: { amount: string; currency: string };
  status: "paid" | "failed" | "refunded";
  created_at: string;
  invoice_id: string | null;
}

export interface BillingSettings {
  processor: { connected: boolean; name: string | null };
  currency: string;
  collect_tax: boolean;
  tax_region: string | null;
}

/** What the instance does with one discovered capability. */
export interface CapabilitySetting {
  app: string;
  enabled: boolean;
  /** Multiplier on wholesale cost; null uses the instance default. */
  markup: number | null;
  surfaces: string[] | null;
}

/** A capability on the network as the operator sees it: what it's called, whether this instance offers it, and who can run it now. */
export interface OfferedCapability {
  app: string;
  /** What it is, as the interface names it: "Text to video". */
  name: string;
  /** Whether this instance offers it to its users. */
  enabled: boolean;
  /** Multiplier on wholesale cost; null uses the instance default. */
  markup: number | null;
  /** Compute operators' runners that advertise it, and how many are ready now. */
  runner_count: number;
  ready_count: number;
  /** True when discovery hasn't seen it lately. */
  stale: boolean;
}

export interface OverviewStats {
  active_users: number;
  jobs_today: number;
  jobs_failed_today: number;
  /** Credits charged, as money at the instance's rate. */
  revenue_usd: number;
  wholesale_usd: number;
  margin_usd: number;
  pending_usd: number;
  /** True while revenue is worked out from wholesale cost at the default markup, rather than reported by the payment provider. */
  revenue_estimated: boolean;
  /** Per day, oldest first. */
  series: Array<{ day: string; revenue_usd: number; wholesale_usd: number }>;
}

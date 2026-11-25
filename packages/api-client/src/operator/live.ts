import { EngineError } from "../live/engine";
import type { AccessKey, CostSummary, EngineHealth, EngineJob, KnownActor, Runner } from "./types";

export interface OperatorEngine {
  /** Work-half base URL: jobs, offerings, runners, costs, allowance. */
  url: string;
  /** Clearinghouse base URL: tenants, grants, allocations, keys. Defaults to `url`. */
  clearinghouseUrl?: string;
  /** Auditor key: every read. */
  reader?: string;
  /** Admin key: writes only. */
  admin?: string;
}

/** Resolved clearinghouse base, falling back to the work-half URL. */
function chUrl(engine: OperatorEngine): string {
  return engine.clearinghouseUrl ?? engine.url;
}

async function request<T>(
  baseUrl: string,
  token: string | undefined,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new EngineError(response.status, `Engine answered ${response.status} for ${method} ${path}`);
  return (await response.json()) as T;
}

/** Reads use the reader token. Nothing here uses the admin token for a read. */
export const read = {
  health: (engine: OperatorEngine) => request<EngineHealth>(engine.url, undefined, "GET", "/readyz"),
  jobs: (engine: OperatorEngine, limit: number) => request<EngineJob[]>(engine.url, engine.reader, "GET", `/v1/jobs?limit=${limit}`),
  /** Credential-scoped: the reader's tenant is implicit. */
  actors: (engine: OperatorEngine) => request<KnownActor[]>(chUrl(engine), engine.reader, "GET", "/v1/clearinghouse/actors"),
  /** Credential-scoped: the reader's tenant is implicit. */
  keys: (engine: OperatorEngine) => request<AccessKey[]>(chUrl(engine), engine.reader, "GET", "/v1/clearinghouse/keys"),
  costs: (engine: OperatorEngine, start: string, end: string) =>
    request<CostSummary>(engine.url, engine.reader, "GET", `/v1/costs/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
  runners: (engine: OperatorEngine, app: string) => request<Runner[]>(engine.url, engine.reader, "GET", `/v1/runners?app=${encodeURIComponent(app)}`),
};

/** Writes use the admin token and carry an operation_ref, which the engine requires. */
export const write = {
  /** Credential-scoped: the admin's tenant is implicit. */
  issueKey: (engine: OperatorEngine, input: { actor_id: string; label: string; kind: AccessKey["kind"] }) =>
    request<{ key: AccessKey; token: string | null; replayed: boolean }>(chUrl(engine), engine.admin, "POST", "/v1/clearinghouse/keys", { ...input, operation_ref: crypto.randomUUID() }),
  /** Credential-scoped: the admin's tenant is implicit. */
  revokeKey: (engine: OperatorEngine, keyId: string) =>
    request<AccessKey>(chUrl(engine), engine.admin, "POST", `/v1/clearinghouse/keys/${encodeURIComponent(keyId)}/revoke`, { operation_ref: crypto.randomUUID() }),
  /**
   * Pauses or resumes an actor's allocation via the public tenant-admin route.
   * The operator's credential scopes the request to its tenant, so no tenant id is in the URL.
   */
  setAllocationStatus: (engine: OperatorEngine, actorId: string, status: "active" | "paused") =>
    request<unknown>(chUrl(engine), engine.admin, "POST", `/v1/clearinghouse/actors/${encodeURIComponent(actorId)}/allocation/status`, { status }),
};

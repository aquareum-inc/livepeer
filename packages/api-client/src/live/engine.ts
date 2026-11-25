import type { Allowance, Offering } from "../types";

export interface EngineConfig {
  url: string;
  /** Bearer token: the least powerful one that works for the call. Server-side only. */
  token?: string;
}

export class EngineError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "EngineError";
    this.status = status;
  }
}

async function get<T>(config: EngineConfig, path: string): Promise<T> {
  const response = await fetch(new URL(path, config.url), {
    headers: config.token ? { Authorization: `Bearer ${config.token}` } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new EngineError(response.status, `Engine answered ${response.status} for GET ${path}`);
  }
  return (await response.json()) as T;
}

/** GET /v1/offerings — public, no credential needed. */
export function listOfferingsLive(config: EngineConfig): Promise<Offering[]> {
  return get<Offering[]>(config, "/v1/offerings");
}

/**
 * GET /v1/allowance for the bearer key's own actor. Omitting `actor_id` is the caller's allocation,
 * which is the builder the signed-in session spends as.
 */
export function getAllowanceLive(config: EngineConfig): Promise<Allowance> {
  return get<Allowance>(config, "/v1/allowance");
}

import "server-only";

import { createBatteriesProvider, createOperatorClient, mockProvider, type OperatorClient, type PaymentProvider } from "@livepeer/api-client";

import { getSession } from "../auth/session";
import { env } from "../env";
import { instance } from "../instance";
import { configCapabilityStore } from "./settings";

export function pricing() {
  const config = instance().pricing;
  return { creditsPerUsd: config?.creditsPerUsd ?? 100, default: config?.markup?.default ?? 1.3, perApp: config?.markup?.perApp ?? {} };
}

/** The payment provider this instance is configured for. `readOnly` leaves the admin token out of it. */
export function paymentProvider(readOnly = false): PaymentProvider {
  const url = instance().engine?.url ?? env("ENGINE_URL");
  const mockOnly = env("MOCK_ONLY") === "1" || env("MOCK_ONLY") === "true";
  if (instance().payments?.provider === "batteries" && url && !mockOnly) {
    const reader = env("ENGINE_READER_TOKEN");
    const admin = readOnly ? undefined : env("ENGINE_ADMIN_TOKEN");
    return createBatteriesProvider({ url, ...(reader ? { reader } : {}), ...(admin ? { admin } : {}) });
  }
  return mockProvider();
}

/**
 * The operator's API client. Refuses anyone who isn't a signed-in operator, so every console
 * read and action is guarded here as well as in the proxy and the layout.
 */
export async function operatorApi(): Promise<OperatorClient> {
  await requireOperator();
  return buildOperatorClient();
}

/** Refuses anyone who isn't a signed-in operator. */
export async function requireOperator(): Promise<void> {
  const session = await getSession();
  if (session?.role !== "operator") throw new Error("Operator role required");
}

/** Builds the operator client. Callers must have checked the operator role first. */
export function buildOperatorClient(): OperatorClient {
  return build(false);
}

/**
 * An operator client that holds the reader token and no admin token, so it can read and change nothing. The
 * alert watcher uses it: it runs with no caller, and only ever reads.
 */
export function buildReaderClient(): OperatorClient {
  return build(true);
}

function build(readOnly: boolean): OperatorClient {
  const url = instance().engine?.url ?? env("ENGINE_URL");
  const reader = env("ENGINE_READER_TOKEN");
  const admin = readOnly ? undefined : env("ENGINE_ADMIN_TOKEN");
  const mockOnly = env("MOCK_ONLY");
  return createOperatorClient({
    ...(url ? { engine: { url, ...(reader ? { reader } : {}), ...(admin ? { admin } : {}) } } : {}),
    provider: paymentProvider(readOnly),
    env: mockOnly ? { MOCK_ONLY: mockOnly } : {},
    pricing: pricing(),
    capabilities: configCapabilityStore(),
  });
}

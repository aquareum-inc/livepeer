import "server-only";

import { OperatorRoleRefused, createBatteriesProvider, createOperatorClient, mockProvider, operatorCan, type OperatorAction, type OperatorClient, type OperatorRole, type PaymentProvider } from "@livepeer/api-client";

import { getSession } from "../auth/session";
import type { Session } from "../auth/types";
import { env } from "../env";
import { instance } from "../instance";
import { operators } from "../operators";
import { configCapabilityStore } from "./settings";

export async function pricing() {
  const config = (await instance()).pricing;
  return { creditsPerUsd: config?.creditsPerUsd ?? 100, default: config?.markup?.default ?? 1.3, perApp: config?.markup?.perApp ?? {} };
}

/** The payment provider this instance is configured for. `readOnly` leaves the admin token out of it. */
export async function paymentProvider(readOnly = false): Promise<PaymentProvider> {
  const url = (await instance()).engine?.url ?? env("ENGINE_URL");
  const mockOnly = env("MOCK_ONLY") === "1" || env("MOCK_ONLY") === "true";
  if ((await instance()).payments?.provider === "batteries" && url && !mockOnly) {
    const reader = env("ENGINE_READER_TOKEN");
    const admin = readOnly ? undefined : env("ENGINE_ADMIN_TOKEN");
    return createBatteriesProvider({ url, ...(reader ? { reader } : {}), ...(admin ? { admin } : {}) });
  }
  return mockProvider();
}

/** Who is asking, and what their place on the team lets them do. */
export interface OperatorStanding {
  session: Session;
  role: OperatorRole;
}

/**
 * What a session may do in the console. The identity provider's operators are owners; everyone else has the
 * role the team list gives them now, not the one they signed in with.
 */
export async function operatorRoleOf(session: Session | null): Promise<OperatorRole | null> {
  if (session?.role !== "operator") return null;
  return session.operatorSource === "grant" ? ((await operators().granted(session.userId))?.role ?? null) : "owner";
}

/**
 * Refuses anyone who isn't a signed-in operator, and, for a change, anyone whose role doesn't allow it.
 * Reading needs no action: every operator reads everything.
 */
export async function requireOperator(action?: OperatorAction): Promise<OperatorStanding> {
  const session = await getSession();
  const role = await operatorRoleOf(session);
  if (!session || !role) throw new Error("Operator role required");
  if (action && !operatorCan(role, action)) throw new OperatorRoleRefused();
  return { session, role };
}

/**
 * The operator's API client, for a read or for the change named. Every console read and action is guarded
 * here as well as in the proxy and the layout. A viewer's client holds no admin token, so a change that
 * slipped past a check would still be refused by the engine.
 */
export async function operatorApi(action?: OperatorAction): Promise<OperatorClient> {
  const { role } = await requireOperator(action);
  return role === "viewer" ? buildReaderClient() : buildOperatorClient();
}

/** Builds the operator client. Callers must have checked the operator role first. */
export function buildOperatorClient(): Promise<OperatorClient> {
  return build(false);
}

/**
 * An operator client that holds the reader token and no admin token, so it can read and change nothing. The
 * alert watcher uses it: it runs with no caller, and only ever reads.
 */
export function buildReaderClient(): Promise<OperatorClient> {
  return build(true);
}

async function build(readOnly: boolean): Promise<OperatorClient> {
  const config = await instance();
  const url = config.engine?.url ?? env("ENGINE_URL");
  const reader = env("ENGINE_READER_TOKEN");
  const admin = readOnly ? undefined : env("ENGINE_ADMIN_TOKEN");
  const mockOnly = env("MOCK_ONLY");
  return createOperatorClient({
    ...(url ? { engine: { url, ...(reader ? { reader } : {}), ...(admin ? { admin } : {}) } } : {}),
    provider: await paymentProvider(readOnly),
    env: mockOnly ? { MOCK_ONLY: mockOnly } : {},
    pricing: await pricing(),
    capabilities: configCapabilityStore(config),
  });
}

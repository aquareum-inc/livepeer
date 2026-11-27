import "server-only";

import { createApiClient, mockProvider, type AccountSummary, type Accounts, type ApiClient } from "@livepeer/api-client";
import { cache } from "react";
import { isCapabilityEnabled } from "@livepeer/config";

import { getSession } from "./auth/session";
import { env } from "./env";
import { instance } from "./instance";
import { describeApps } from "./models";
import { uploadLimitBytes } from "./upload-limit";

/**
 * The API client for the signed-in user. Discovery is public, so it is read without a
 * credential; everything else is called on the user's behalf from the server.
 */
export async function api(): Promise<ApiClient> {
  const session = await getSession();
  if (!session) return apiFor(null);
  return apiFor({ id: session.userId, name: session.name }, "offered", await workspaceOf(session));
}

/**
 * The workspace a session is working in, or null for the personal account. The cookie only names it: the
 * provider is asked whether the person still belongs, so someone removed falls back to their own account.
 */
export async function workspaceOf(session: { userId: string; workspaceId?: string | null }): Promise<string | null> {
  if (!session.workspaceId) return null;
  // The user app's client reads the same provider (`createApiClient`'s default).
  const memberships = await mockProvider().workspaces.listForUser(session.userId);
  return memberships.some((entry) => entry.workspace.id === session.workspaceId) ? session.workspaceId : null;
}

/**
 * The API client for a known user, or the instance's default account when there is none. It lists and runs only
 * what the instance offers; `network` lists everything discovered, for comparing the two (the studio uses it to
 * tell a mode the operator withdrew from one no operator offers yet). Never run anything with a `network` client.
 * `workspaceId` is the workspace the person is working in; callers must have checked they belong (`workspaceOf`).
 * `viaApiKey` is for a workspace's API key, which has no person behind it.
 */
export async function apiFor(user: { id: string; name: string } | null, scope: "offered" | "network" = "offered", workspaceId: string | null = null, viaApiKey = false): Promise<ApiClient> {
  const config = await instance();
  const url = config.engine?.url ?? env("ENGINE_URL");
  const mockOnly = env("MOCK_ONLY");
  const uploadLimit = uploadLimitBytes();
  return createApiClient({
    ...(url ? { engine: { url } } : {}),
    describeApps: async (apps) => (await describeApps(apps)).data,
    env: mockOnly ? { MOCK_ONLY: mockOnly } : {},
    ...(scope === "offered" ? { offers: (app: string) => isCapabilityEnabled(app, config.capabilities) } : {}),
    ...(user ? { user } : {}),
    workspaceId,
    viaApiKey,
    ...(uploadLimit ? { uploadLimitBytes: uploadLimit } : {}),
    pricing: {
      creditsPerUsd: config.pricing?.creditsPerUsd ?? 100,
      default: config.pricing?.markup?.default ?? 1.3,
      ...(config.pricing?.markup?.perApp ? { perApp: config.pricing.markup.perApp } : {}),
    },
  });
}

/** The signed-in person's accounts and invitations, read once per request. Null for a guest. */
export const accounts = cache(async (): Promise<Accounts | null> => {
  if (!(await getSession())) return null;
  return (await (await api()).listAccounts()).data;
});

/** The account the request acts in: the person's own, or a workspace. Null for a guest. */
export async function currentAccount(): Promise<AccountSummary | null> {
  const list = await accounts();
  return list?.accounts.find((entry) => entry.id === list.current) ?? null;
}

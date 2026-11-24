import "server-only";

import { appModel, type DataSource, type AppModel, type Offering, type Sourced } from "@livepeer/api-client";
import { placeCapability } from "@livepeer/config";

import { instance } from "./instance";
import { buildOperatorClient } from "./operator/client";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; model: AppModel | null; source: DataSource }>();

/**
 * The models behind the given apps, from their runners' descriptions. Discovery doesn't say which
 * model serves an app (engine request R1), so this reads them with the reader token: the one
 * user-facing read made with it. It stays on the server, and only model names and context sizes
 * leave it. Cached for a few minutes, since runners change slowly; a failed read names nothing.
 */
export async function describeApps(apps: ReadonlyArray<string>): Promise<Sourced<AppModel[]>> {
  const client = await buildOperatorClient();
  const found = await Promise.all(
    [...new Set(apps)].map(async (app) => {
      const cached = cache.get(app);
      if (cached && Date.now() - cached.at < TTL_MS) return cached;
      const entry = await client
        .listRunners(app)
        .then((result) => ({ at: Date.now(), model: appModel(app, result.data), source: result.source }))
        .catch(() => ({ at: Date.now(), model: null, source: "live" as const }));
      cache.set(app, entry);
      return entry;
    }),
  );
  return {
    data: found.flatMap((entry) => entry.model ?? []),
    source: found.some((entry) => entry.source === "live") ? "live" : "mock",
  };
}

/** The models behind the apps on offer, for the studio picker and the agent's steps. Media tools run no model. */
export async function appModels(offerings: ReadonlyArray<Offering>): Promise<Sourced<AppModel[]>> {
  const { capabilities } = await instance();
  return describeApps(offerings.filter((offering) => placeCapability(offering, capabilities?.overrides).kind !== "media-action").map((offering) => offering.app));
}

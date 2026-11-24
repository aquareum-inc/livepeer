import "server-only";

import type { OperatorClient } from "@livepeer/api-client";
import { isCapabilityEnabled, placeCapability } from "@livepeer/config";
import type { CapabilityRow } from "@livepeer/operator-console";

import { instance } from "../instance";

/** The Capabilities page's rows: everything discovery returns, with how this instance places, prices and offers each. */
export async function capabilityRows(client: OperatorClient): Promise<{ rows: CapabilityRow[]; source: "live" | "mock" }> {
  const { capabilities } = await instance();
  const offerings = await client.listOfferings();
  const rows = await Promise.all(
    offerings.data.map(async (offering) => {
      const placement = placeCapability(offering, capabilities?.overrides);
      return {
        offering,
        kind: placement.kind.replace(/-/g, " "),
        surfaces: placement.surfaces,
        // Blocked by a rule in the deployed config; the console's own switch is the exact entry, read as the setting.
        allowed: isCapabilityEnabled(offering.app, { ...capabilities, block: (capabilities?.block ?? []).filter((rule) => rule !== offering.app) }),
        setting: (await client.getCapabilitySetting(offering.app)).data,
      };
    }),
  );
  return { rows, source: offerings.source };
}

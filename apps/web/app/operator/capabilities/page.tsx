import { CapabilitiesView } from "@livepeer/operator-console";
import type { Metadata } from "next";

import { instance } from "@/lib/instance";
import { resetCapabilitiesAction, updateCapabilityAction } from "@/lib/operator/actions";
import { capabilityRows } from "@/lib/operator/capability-rows";
import { operatorApi, pricing } from "@/lib/operator/client";
import { capabilityOverrides } from "@/lib/operator/settings";

export const metadata: Metadata = { title: "Capabilities" };

export default async function CapabilitiesPage() {
  const client = await operatorApi();
  const { surfaces, mobile } = await instance();
  const phones = surfaces.mobile === true && Boolean(mobile?.ios?.bundleId || mobile?.android?.applicationId);
  const { rows, source } = await capabilityRows(client);
  const overrides = await capabilityOverrides();
  return (
    <CapabilitiesView
      rows={rows}
      defaultMarkup={(await pricing()).default}
      update={updateCapabilityAction}
      placing={surfaces.app || phones}
      overridden={overrides.saved}
      ignored={overrides.ignored}
      reset={resetCapabilitiesAction}
      sources={[{ name: "listOfferings", source }, { name: "updateCapabilitySetting", source: "live" }]}
    />
  );
}

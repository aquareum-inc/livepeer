import type { LiveDestination, LiveLook } from "@livepeer/api-client";
import { capabilitiesFor, filterCapabilities } from "@livepeer/config";
import { DataSourceBadge } from "@livepeer/user-app";
import type { Metadata } from "next";

import { Live } from "@/components/live";
import { api } from "@/lib/api";
import { getSession } from "@/lib/auth/session";
import { isDev } from "@/lib/env";
import { instance } from "@/lib/instance";

export const metadata: Metadata = { title: "Live" };

export default async function LivePage() {
  const client = await api();
  const signedIn = (await getSession()) !== null;
  const { capabilities } = await instance();
  // Saved looks and destinations belong to an account; a guest starts with none.
  const [offerings, looks, destinations] = await Promise.all([
    client.listOfferings(),
    signedIn ? client.listLiveLooks() : Promise.resolve({ data: [] as LiveLook[], source: "mock" as const }),
    signedIn ? client.listLiveDestinations() : Promise.resolve({ data: [] as LiveDestination[], source: "mock" as const }),
  ]);
  // Real-time sessions the instance offers, without the transcoding and delivery that support them.
  const sessions = capabilitiesFor("live", filterCapabilities(offerings.data, capabilities), capabilities?.overrides).filter(
    (offering) => !/transcode|delivery|ffmpeg|publish/.test(offering.app),
  );
  return (
    <>
      <Live offerings={sessions} looks={looks.data} destinations={destinations.data} />
      {isDev ? (
        <DataSourceBadge
          sources={[
            { name: "listOfferings", source: offerings.source },
            { name: "listLiveLooks", source: looks.source },
            { name: "startLiveSession", source: "mock" },
          ]}
        />
      ) : null}
    </>
  );
}

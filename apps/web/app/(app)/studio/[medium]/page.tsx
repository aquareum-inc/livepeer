import { DataSourceBadge, isMedium } from "@livepeer/user-app";
import { MEDIUM_ORDER, studioModes, withdrawnModes } from "@livepeer/user-app/studio-mediums";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Studio } from "@/components/studio";
import { apiFor } from "@/lib/api";
import { getSession } from "@/lib/auth/session";
import { studioOfferings } from "@/lib/catalogue";
import { isDev } from "@/lib/env";
import { appModels } from "@/lib/models";

export const metadata: Metadata = { title: "Studio" };

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ medium: string }>;
  searchParams: Promise<{ prompt?: string }>;
}) {
  const [{ medium }, { prompt }] = await Promise.all([params, searchParams]);
  if (!isMedium(medium)) notFound();
  const [offerings, session] = await Promise.all([(await apiFor(null, "network")).listOfferings(), getSession()]);
  // What the network offers, and of that what this instance offers in the studio.
  const offered = await studioOfferings(offerings.data);
  const withdrawn = withdrawnModes(offerings.data, offered);
  // A medium the operator has taken every mode out of isn't offered: open the first one that is.
  if (studioModes(medium, withdrawn).length === 0) {
    const next = MEDIUM_ORDER.find((entry) => studioModes(entry, withdrawn).length > 0);
    if (!next) notFound();
    redirect(`/studio/${next}${prompt ? `?prompt=${encodeURIComponent(prompt)}` : ""}`);
  }
  const models = await appModels(offered);
  return (
    <>
      <Studio medium={medium} offerings={offered} withdrawn={withdrawn} models={models.data} initialPrompt={prompt ?? ""} signedIn={session !== null} />
      {isDev ? (
        <DataSourceBadge
          sources={[
            { name: "listOfferings", source: offerings.source },
            { name: "listRunners (models)", source: models.source },
            { name: "createGeneration", source: "mock" },
          ]}
        />
      ) : null}
    </>
  );
}

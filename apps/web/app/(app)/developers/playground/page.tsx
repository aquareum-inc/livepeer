import { DataSourceBadge, DevelopersLayout, Playground } from "@livepeer/user-app";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { analyseVideoAction, startPlaygroundSessionAction, stopLiveSessionAction } from "@/lib/actions";
import { developerTabs } from "@/lib/developers";
import { instance } from "@/lib/instance";
import { isDev } from "@/lib/env";
import { origin } from "@/lib/origin";

export const metadata: Metadata = { title: "Playground" };

export default async function PlaygroundPage() {
  const { surfaces } = await instance();
  // API code: served only with the API on. The proxy checks this too.
  if (!surfaces.api) notFound();
  return (
    <DevelopersLayout current="/developers/playground" available={developerTabs(surfaces)} surfaces={surfaces}>
      <Playground origin={await origin()} analyse={analyseVideoAction} startSession={startPlaygroundSessionAction} stopSession={stopLiveSessionAction} />
      {isDev ? <DataSourceBadge sources={[{ name: "analyseVideo", source: "mock" }, { name: "startLiveSession", source: "mock" }]} /> : null}
    </DevelopersLayout>
  );
}

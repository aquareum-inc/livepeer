import { DataSourceBadge, DevelopersLayout, ModelScreen } from "@livepeer/user-app";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { runCapabilityAction } from "@/lib/actions";
import { api } from "@/lib/api";
import { catalogue } from "@/lib/catalogue";
import { developerTabs } from "@/lib/developers";
import { instance } from "@/lib/instance";
import { isDev } from "@/lib/env";
import { origin } from "@/lib/origin";

type Props = { params: Promise<{ app: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).app.map(decodeURIComponent).join("/") };
}

export default async function ModelPage({ params }: Props) {
  const { surfaces } = await instance();
  const name = (await params).app.map(decodeURIComponent).join("/");
  const offerings = await (await api()).listOfferings();
  const entry = (await catalogue(offerings.data)).find((candidate) => candidate.offering.app === name);
  if (!entry) notFound();
  return (
    <DevelopersLayout current="/developers/models" available={developerTabs(surfaces)} surfaces={surfaces}>
      <ModelScreen entry={entry} origin={await origin()} run={runCapabilityAction} api={surfaces.api} />
      {isDev ? <DataSourceBadge sources={[{ name: "listOfferings", source: offerings.source }, { name: "runCapability", source: "mock" }]} /> : null}
    </DevelopersLayout>
  );
}

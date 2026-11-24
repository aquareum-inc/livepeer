import { DataSourceBadge, DevelopersLayout, ModelsScreen } from "@livepeer/user-app";
import type { Metadata } from "next";

import { api } from "@/lib/api";
import { catalogue } from "@/lib/catalogue";
import { developerTabs } from "@/lib/developers";
import { instance } from "@/lib/instance";
import { isDev } from "@/lib/env";

export const metadata: Metadata = { title: "Models" };

export default async function ModelsPage() {
  const { surfaces } = await instance();
  const offerings = await (await api()).listOfferings();
  return (
    <DevelopersLayout current="/developers/models" available={developerTabs(surfaces)} surfaces={surfaces}>
      <ModelsScreen entries={await catalogue(offerings.data)} />
      {isDev ? <DataSourceBadge sources={[{ name: "listOfferings", source: offerings.source }]} /> : null}
    </DevelopersLayout>
  );
}

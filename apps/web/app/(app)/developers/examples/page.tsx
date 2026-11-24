import { DataSourceBadge, DevelopersLayout, ExamplesScreen } from "@livepeer/user-app";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { api } from "@/lib/api";
import { developerTabs } from "@/lib/developers";
import { instance } from "@/lib/instance";
import { isDev } from "@/lib/env";

export const metadata: Metadata = { title: "Examples" };

export default async function ExamplesPage() {
  const { surfaces } = await instance();
  // API code: served only with the API on. The proxy checks this too.
  if (!surfaces.api) notFound();
  const examples = await (await api()).listExampleApps();
  return (
    <DevelopersLayout current="/developers/examples" available={developerTabs(surfaces)} surfaces={surfaces}>
      <ExamplesScreen examples={examples.data} />
      {isDev ? <DataSourceBadge sources={[{ name: "listExampleApps", source: examples.source }]} /> : null}
    </DevelopersLayout>
  );
}

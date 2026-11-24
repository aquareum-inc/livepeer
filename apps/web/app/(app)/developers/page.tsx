import { DevelopersLayout, DevelopersOverview } from "@livepeer/user-app";
import type { Metadata } from "next";

import { developerTabs } from "@/lib/developers";
import { instance } from "@/lib/instance";
import { origin } from "@/lib/origin";

export const metadata: Metadata = { title: "Developers" };

export default async function DevelopersPage() {
  const { name, surfaces } = await instance();
  return (
    <DevelopersLayout current="/developers" available={developerTabs(surfaces)} surfaces={surfaces}>
      <DevelopersOverview origin={await origin()} instanceName={name} surfaces={surfaces} />
    </DevelopersLayout>
  );
}

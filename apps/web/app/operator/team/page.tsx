import type { Metadata } from "next";

import { TeamPanel } from "@/components/team-panel";
import { instance } from "@/lib/instance";
import { requireOperator } from "@/lib/operator/client";
import { teamManagement } from "@/lib/operators/manage";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const { session, role } = await requireOperator();
  const { domain } = await instance();
  return <TeamPanel team={await teamManagement().view(role)} me={session.userId} origin={domain ? `https://${domain}` : ""} appAvailable={(await instance()).surfaces.app} />;
}

import { WorkspacesView } from "@livepeer/operator-console";
import type { Metadata } from "next";

import { ConsoleLink } from "@/components/console";
import { operatorApi } from "@/lib/operator/client";

export const metadata: Metadata = { title: "Workspaces" };

export default async function WorkspacesPage() {
  const client = await operatorApi();
  const workspaces = await client.listWorkspaces();
  return <WorkspacesView workspaces={workspaces.data} supported={client.provider.features.workspaces} Link={ConsoleLink} sources={[{ name: "listWorkspaces", source: workspaces.source }]} />;
}

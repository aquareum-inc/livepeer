import { WorkspaceDetailView } from "@livepeer/operator-console";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ConsoleLink } from "@/components/console";
import { assignWorkspacePlanAction, setWorkspaceStatusAction, topUpWorkspaceAction } from "@/lib/operator/actions";
import { operatorApi } from "@/lib/operator/client";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const client = await operatorApi();
  const { provider } = client;
  const [workspace, keys, plans, usage] = await Promise.all([
    client.getWorkspace(id),
    client.listAccessKeys(),
    provider.plans.listPlans(),
    provider.usage.listUsage({ userId: id, limit: 20 }).catch(() => []),
  ]);
  if (!workspace.data) notFound();
  return (
    <WorkspaceDetailView
      workspace={workspace.data}
      plans={plans}
      plansSupported={provider.features.plans}
      usage={usage}
      // A workspace is one account on the engine, so its keys are that account's.
      keys={keys.data.filter((key) => key.actor_id === id).map((key) => ({ id: key.key_id, label: key.label, created: key.created_at, revoked: key.revoked_at !== null }))}
      Link={ConsoleLink}
      setStatus={setWorkspaceStatusAction.bind(null, id)}
      assignPlan={assignWorkspacePlanAction.bind(null, id)}
      topUp={topUpWorkspaceAction.bind(null, id)}
      sources={[
        { name: "getWorkspace", source: workspace.source },
        { name: "listAccessKeys", source: keys.source },
        { name: "usage.listUsage", source: "mock" },
      ]}
    />
  );
}

import { UserDetailView } from "@livepeer/operator-console";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ConsoleLink } from "@/components/console";
import { assignPlanAction, setUserStatusAction, topUpUserAction } from "@/lib/operator/actions";
import { operatorApi } from "@/lib/operator/client";
import { operators } from "@/lib/operators";
import { userRows } from "@/lib/operator/users";

export const metadata: Metadata = { title: "User" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const client = await operatorApi();
  const { provider } = client;
  const [{ people, unlinked, sources }, keys, plans] = await Promise.all([userRows(client), client.listAccessKeys(), provider.plans.listPlans()]);
  const user = [...people, ...unlinked].find((row) => row.id === id);
  if (!user) notFound();
  const onTeam = (await operators().operators()).find((operator) => operator.user_id === id) ?? null;
  const [usage, memberships] = await Promise.all([
    provider.usage.listUsage({ userId: id, limit: 20 }).catch(() => []),
    provider.features.workspaces ? provider.workspaces.listForUser(id) : [],
  ]);
  return (
    <UserDetailView
      user={user}
      plans={plans}
      plansSupported={provider.features.plans}
      usage={usage}
      keys={keys.data.filter((key) => key.actor_id === id).map((key) => ({ id: key.key_id, label: key.label, created: key.created_at, revoked: key.revoked_at !== null }))}
      workspaces={memberships.map(({ workspace, role }) => ({ id: workspace.id, name: workspace.name, role, status: workspace.status }))}
      Link={ConsoleLink}
      setStatus={setUserStatusAction.bind(null, user.applicationId, id)}
      team={onTeam?.role ?? null}
      assignPlan={assignPlanAction.bind(null, id)}
      topUp={topUpUserAction.bind(null, id)}
      sources={[
        ...sources,
        { name: "listAccessKeys", source: keys.source },
        { name: "usage.listUsage", source: "mock" },
        ...(provider.features.workspaces ? [{ name: "workspaces.listForUser", source: "mock" as const }] : []),
      ]}
    />
  );
}

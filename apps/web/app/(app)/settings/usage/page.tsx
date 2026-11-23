import { DataSourceBadge, SettingsLayout, UsageSettings } from "@livepeer/user-app";
import type { Metadata } from "next";

import { can } from "@livepeer/api-client";

import { api, currentAccount } from "@/lib/api";
import { isDev } from "@/lib/env";

export const metadata: Metadata = { title: "Usage" };

export default async function UsagePage() {
  const client = await api();
  const [usage, current] = await Promise.all([client.getUsage(), currentAccount()]);
  const workspace = current?.kind === "workspace" ? current : null;
  const everyone = workspace !== null && can(workspace.role, "view_all_usage");
  const byMember = everyone ? await client.getMemberUsage() : null;
  return (
    <SettingsLayout current="/settings/usage">
      <UsageSettings
        summary={usage.data.summary}
        entries={usage.data.entries}
        workspace={workspace ? { name: workspace.name, scope: everyone ? "everyone" : "own" } : null}
        byMember={byMember?.data ?? null}
      />
      {isDev ? <DataSourceBadge sources={[{ name: "getUsage", source: usage.source }, ...(byMember ? [{ name: "getMemberUsage", source: byMember.source }] : [])]} /> : null}
    </SettingsLayout>
  );
}

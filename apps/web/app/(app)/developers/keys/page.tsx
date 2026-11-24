import { can } from "@livepeer/api-client";
import { DataSourceBadge, DevelopersLayout, KeysScreen, KeysUnavailable } from "@livepeer/user-app";
import type { Metadata } from "next";

import { createApiKeyAction, revokeApiKeyAction } from "@/lib/actions";
import { api, currentAccount } from "@/lib/api";
import { developerTabs } from "@/lib/developers";
import { instance } from "@/lib/instance";
import { isDev } from "@/lib/env";

export const metadata: Metadata = { title: "API keys" };

export default async function KeysPage() {
  const { surfaces } = await instance();
  const current = await currentAccount();
  if (current && !can(current.role, "manage_keys")) {
    return (
      <DevelopersLayout current="/developers/keys" available={developerTabs(surfaces)} surfaces={surfaces}>
        <KeysUnavailable workspace={current.name} />
      </DevelopersLayout>
    );
  }
  const keys = await (await api()).listApiKeys();
  return (
    <DevelopersLayout current="/developers/keys" available={developerTabs(surfaces)} surfaces={surfaces}>
      <KeysScreen initialKeys={keys.data} create={createApiKeyAction} revoke={revokeApiKeyAction} />
      {isDev ? <DataSourceBadge sources={[{ name: "listApiKeys", source: keys.source }]} /> : null}
    </DevelopersLayout>
  );
}

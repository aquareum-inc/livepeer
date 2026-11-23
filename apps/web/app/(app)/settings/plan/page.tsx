import { DataSourceBadge, PlanSettings, SettingsLayout } from "@livepeer/user-app";
import type { Metadata } from "next";

import { buyCreditPackAction, buyCreditsAction, changePlanAction } from "@/lib/actions";
import { api, currentAccount } from "@/lib/api";
import { can } from "@livepeer/api-client";
import { isDev } from "@/lib/env";

export const metadata: Metadata = { title: "Plan and credits" };

export default async function PlanPage() {
  const client = await api();
  const [account, balance, current] = await Promise.all([client.getAccount(), client.getCreditBalance(), currentAccount()]);
  // In a workspace only its owner buys credit or changes the plan; everyone else sees them.
  const owner = current && !can(current.role, "manage_billing") ? (await client.getWorkspace()).data?.members.find((member) => member.role === "owner") : undefined;
  return (
    <SettingsLayout current="/settings/plan">
      <PlanSettings account={account.data} balance={balance.data} buyPack={buyCreditPackAction} buyCredits={buyCreditsAction} changePlan={changePlanAction} readOnly={current && owner ? { workspace: current.name, owner: owner.name } : null} />
      {isDev ? <DataSourceBadge sources={[{ name: "getAccount", source: account.source }, { name: "getCreditBalance", source: balance.source }]} /> : null}
    </SettingsLayout>
  );
}

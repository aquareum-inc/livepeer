import { SettingsView } from "@livepeer/operator-console";
import type { Metadata } from "next";

import { resetInstanceSettingsAction, saveInstanceSettingsAction } from "@/lib/operator/actions";
import { operatorApi } from "@/lib/operator/client";
import { instance } from "@/lib/instance";
import { currentSettings } from "@/lib/operator/settings";

export const metadata: Metadata = { title: "Instance settings" };

export default async function SettingsPage() {
  await operatorApi();
  const { settings, source, saved, ignored } = await currentSettings();
  const apps = (await instance()).mobile;
  return <SettingsView initial={settings} phoneAppsNamed={Boolean(apps?.ios?.bundleId || apps?.android?.applicationId)} source={source} overridden={saved} ignored={ignored} save={saveInstanceSettingsAction} reset={resetInstanceSettingsAction} />;
}

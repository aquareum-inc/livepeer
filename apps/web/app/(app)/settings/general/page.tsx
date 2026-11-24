import { DataSourceBadge, GeneralSettings, SettingsLayout } from "@livepeer/user-app";
import type { Metadata } from "next";

import { updatePreferencesAction } from "@/lib/actions";
import { api } from "@/lib/api";
import { isDev } from "@/lib/env";
import { instance } from "@/lib/instance";

export const metadata: Metadata = { title: "General settings" };

export default async function GeneralPage() {
  const preferences = await (await api()).getPreferences();
  return (
    <SettingsLayout current="/settings/general">
      <GeneralSettings initial={preferences.data} adultContentOffered={(await instance()).content?.adultContent ?? false} update={updatePreferencesAction} />
      {isDev ? <DataSourceBadge sources={[{ name: "getPreferences", source: preferences.source }]} /> : null}
    </SettingsLayout>
  );
}

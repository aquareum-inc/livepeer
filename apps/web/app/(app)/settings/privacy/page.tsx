import { PrivacySettings, SettingsLayout } from "@livepeer/user-app";
import { describePrivacy } from "@livepeer/user-app/privacy";
import type { Metadata } from "next";

import { instance } from "@/lib/instance";

export const metadata: Metadata = { title: "Privacy" };

export default async function PrivacyPage() {
  return (
    <SettingsLayout current="/settings/privacy">
      <PrivacySettings description={describePrivacy((await instance()).privacy?.retainChats ?? false)} />
    </SettingsLayout>
  );
}

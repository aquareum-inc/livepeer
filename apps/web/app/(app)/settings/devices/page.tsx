import { DevicesSettings, SettingsLayout } from "@livepeer/user-app";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { revokeDeviceAction } from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import { devices } from "@/lib/devices";

export const metadata: Metadata = { title: "Devices" };

export default async function DevicesPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return (
    <SettingsLayout current="/settings/devices">
      <DevicesSettings devices={await devices().list(session.userId, null)} revoke={revokeDeviceAction} />
    </SettingsLayout>
  );
}

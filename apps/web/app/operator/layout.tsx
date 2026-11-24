import { NewPhoneNotice } from "@livepeer/operator-console";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Console, ConsoleLink } from "@/components/console";
import { DevRoleSwitch } from "@/components/dev-role-switch";
import { getSession } from "@/lib/auth/session";
import { isDev } from "@/lib/env";
import { brandOf, instance } from "@/lib/instance";
import { operatorDevices } from "@/lib/operator-devices";

/** How long a newly enrolled phone is announced on every console page. */
const NEW_PHONE_MS = 48 * 3600_000;

export const metadata: Metadata = { title: { default: "Operator console", template: "%s · Operator console" } };
export const dynamic = "force-dynamic";

export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const config = instance();
  const { surfaces } = config;
  if (!surfaces.console) notFound();
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/operator");
  // Hidden from users: to anyone who isn't an operator the console doesn't exist.
  if (session.role !== "operator") notFound();
  const newPhones = (await operatorDevices().list())
    .filter((phone) => Date.now() - Date.parse(phone.created_at) < NEW_PHONE_MS)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <>
      <Console brand={brandOf(config)} appAvailable={surfaces.app}>
        <NewPhoneNotice phones={newPhones} Link={ConsoleLink} />
        {children}
      </Console>
      {isDev ? <DevRoleSwitch role={session.role} /> : null}
    </>
  );
}

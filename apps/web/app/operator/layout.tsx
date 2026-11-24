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
import { dismissNewPhonesAction } from "@/lib/operator/actions";

export const metadata: Metadata = { title: { default: "Operator console", template: "%s · Operator console" } };
export const dynamic = "force-dynamic";

export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const config = await instance();
  const { surfaces } = config;
  if (!surfaces.console) notFound();
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/operator");
  // Hidden from users: to anyone who isn't an operator the console doesn't exist.
  if (session.role !== "operator") notFound();
  // New phones are announced to each operator until they close the notice. After that System carries a dot
  // until they open it, where the phone is listed and tagged as new.
  const { announced, marked } = await operatorDevices().newPhones(session.userId);
  const marks: Record<string, string> = {};
  if (marked.length > 0) marks["/operator/system"] = marked.length === 1 ? "an operator phone was added in the last two days" : `${marked.length} operator phones were added in the last two days`;
  return (
    <>
      <Console brand={brandOf(config)} appAvailable={surfaces.app} marks={marks}>
        <NewPhoneNotice phones={announced} dismiss={dismissNewPhonesAction.bind(null, announced.map((phone) => phone.id))} Link={ConsoleLink} />
        {children}
      </Console>
      {isDev ? <DevRoleSwitch role={session.role} /> : null}
    </>
  );
}

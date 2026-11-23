import { CreditsProvider, SIDEBAR_COOKIE, sidebarOpenFrom } from "@livepeer/user-app";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DevRoleSwitch } from "@/components/dev-role-switch";
import { Shell } from "@/components/shell";
import { accounts, api } from "@/lib/api";
import { checkAccess } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { developerTabs } from "@/lib/developers";
import { isDev } from "@/lib/env";
import { brandOf, instance } from "@/lib/instance";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const config = instance();
  if (!config.surfaces.app) notFound();
  const session = await getSession();
  const pathname = (await headers()).get("x-pathname") ?? "";
  // Guests can look around; account pages need a session (lib/auth/guard.ts). The proxy enforces it too.
  if (!session && checkAccess(pathname || "/unknown", null) !== "allow") redirect("/sign-in");
  const client = await api();
  const [credits, recents, list] = session
    ? await Promise.all([client.getCreditBalance().then((result) => result.data.credits), client.listConversations().then((result) => result.data.slice(0, 12)), accounts()])
    : [0, [], null];
  return (
    // Keyed by account, so switching starts the balance again from the new account's.
    <CreditsProvider key={list?.current ?? "guest"} initial={credits}>
      <Shell
        brand={brandOf(config)}
        characters={config.content?.characters ?? true}
        recents={recents}
        account={session ? { name: session.name, email: session.email, role: session.role } : null}
        accounts={list?.workspaces_supported ? list : null}
        consoleAvailable={config.surfaces.console}
        developersAvailable={developerTabs(config.surfaces).length > 0}
        sidebarOpen={sidebarOpenFrom((await cookies()).get(SIDEBAR_COOKIE)?.value)}
      >
        {children}
      </Shell>
      {isDev && session ? <DevRoleSwitch role={session.role} /> : null}
    </CreditsProvider>
  );
}

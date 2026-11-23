"use client";

import { Page, TabNav } from "@livepeer/ui";
import type { ReactNode } from "react";

import { useAccount } from "../shell/account";
import { useLink } from "../shell/link";

const TABS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/general", label: "General" },
  { href: "/settings/privacy", label: "Privacy" },
  { href: "/settings/plan", label: "Plan and credits" },
  { href: "/settings/usage", label: "Usage" },
  { href: "/settings/devices", label: "Devices" },
];

/** In a workspace, its own tab sits with the things that are the workspace's: before the plan and usage. */
const WORKSPACE_TAB = { href: "/settings/workspace", label: "Workspace" };

export function SettingsLayout({ current, children }: { current: string; children: ReactNode }) {
  const Link = useLink();
  const tabs = useAccount()?.kind === "workspace" ? [...TABS.slice(0, 3), WORKSPACE_TAB, ...TABS.slice(3)] : TABS;
  return (
    <Page title="Settings" width="narrow" tabs={<TabNav label="Settings" tabs={tabs} current={current} Link={Link} />}>
      {children}
    </Page>
  );
}

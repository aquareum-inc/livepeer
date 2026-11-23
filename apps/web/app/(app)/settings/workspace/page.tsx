import { DataSourceBadge, SettingsLayout, WorkspaceSettings } from "@livepeer/user-app";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  inviteMemberAction,
  leaveWorkspaceAction,
  removeMemberAction,
  renameWorkspaceAction,
  revokeInvitationAction,
  setMemberRoleAction,
  transferOwnershipAction,
} from "@/lib/actions";
import { api } from "@/lib/api";
import { isDev } from "@/lib/env";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspacePage() {
  const workspace = await (await api()).getWorkspace();
  // A personal account has no workspace page.
  if (!workspace.data) redirect("/settings");
  return (
    <SettingsLayout current="/settings/workspace">
      <WorkspaceSettings
        detail={workspace.data}
        rename={renameWorkspaceAction}
        invite={inviteMemberAction}
        revokeInvitation={revokeInvitationAction}
        setRole={setMemberRoleAction}
        remove={removeMemberAction}
        transfer={transferOwnershipAction}
        leave={leaveWorkspaceAction}
      />
      {isDev ? <DataSourceBadge sources={[{ name: "getWorkspace", source: workspace.source }]} /> : null}
    </SettingsLayout>
  );
}

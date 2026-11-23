import { DataSourceBadge, JoinWorkspace } from "@livepeer/user-app";
import type { Metadata } from "next";

import { acceptInvitationAction, declineInvitationAction } from "@/lib/actions";
import { accounts, api } from "@/lib/api";
import { isDev } from "@/lib/env";

export const metadata: Metadata = { title: "Join a workspace" };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invitation, list] = await Promise.all([(await api()).getInvitation(token), accounts()]);
  return (
    <>
      <JoinWorkspace
        invitation={invitation.data}
        alreadyMember={Boolean(invitation.data && list?.accounts.some((entry) => entry.id === invitation.data?.workspace_id))}
        accept={acceptInvitationAction}
        decline={declineInvitationAction}
      />
      {isDev ? <DataSourceBadge sources={[{ name: "getInvitation", source: invitation.source }]} /> : null}
    </>
  );
}

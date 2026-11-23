"use client";

import type { WorkspaceInvitation } from "@livepeer/api-client/provider";
import { Button, Card, EmptyState } from "@livepeer/ui";
import { MailX } from "lucide-react";
import { useState, useTransition } from "react";

import { useLink } from "../shell/link";
import { ROLE_SUMMARY, WorkspaceMark, type Outcome } from "./shared";

export interface JoinWorkspaceProps {
  /** Null when the link isn't a real invitation. */
  invitation: WorkspaceInvitation | null;
  /** Whether the person already belongs to the workspace. */
  alreadyMember: boolean;
  accept: (token: string) => Promise<Outcome>;
  decline: (token: string) => Promise<Outcome<boolean>>;
}

const CLOSED: Record<Exclude<WorkspaceInvitation["status"], "pending">, string> = {
  accepted: "This invitation has already been used.",
  declined: "This invitation was declined.",
  revoked: "This invitation was cancelled.",
  expired: "This invitation ran out. They last 7 days.",
};

/** Where an invitation link lands: what you're joining and who asked, then join or decline. */
export function JoinWorkspace({ invitation, alreadyMember, accept, decline }: JoinWorkspaceProps) {
  const Link = useLink();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  const home = <Button asChild><Link href="/">Back to Home</Link></Button>;

  if (!invitation) {
    return <EmptyState icon={MailX} title="This link isn't an invitation" body="Check it was copied in full, or ask whoever invited you to send it again." action={home} />;
  }
  if (declined || invitation.status !== "pending") {
    return (
      <EmptyState
        icon={MailX}
        title={declined ? "Invitation declined" : "This invitation is no longer open"}
        body={declined ? `You haven't joined ${invitation.workspace_name}. ${invitation.invited_by_name} can invite you again if you change your mind.` : `${CLOSED[invitation.status as keyof typeof CLOSED]} Ask ${invitation.invited_by_name} for a new one.`}
        action={home}
      />
    );
  }

  const answer = (action: () => Promise<Outcome<unknown>>, done?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result) return;
      if (result.ok) done?.();
      else setError(result.error);
    });
  };

  return (
    <Card className="mx-auto flex max-w-[440px] flex-col items-center px-6 py-10 text-center">
      <WorkspaceMark name={invitation.workspace_name} className="mb-5 size-14 rounded-[15px] text-title" />
      <h2 className="text-title font-semibold tracking-[-0.01em]">Join {invitation.workspace_name}</h2>
      <p className="mt-2 max-w-[36ch] text-body text-muted-foreground">
        {invitation.invited_by_name} invited you as {invitation.role === "admin" ? "an admin" : "a member"}. You'll share the workspace's credit, library and characters.
      </p>
      <p className="mt-3 max-w-[36ch] text-caption text-subtle-foreground">{ROLE_SUMMARY[invitation.role]} Your personal account stays as it is.</p>
      {alreadyMember ? <p className="mt-4 text-caption text-muted-foreground">You already belong to this workspace. Switch to it from the account menu.</p> : null}
      {error ? <p role="alert" className="mt-4 text-caption text-destructive">{error}</p> : null}
      <div className="mt-6 flex w-full gap-2">
        <Button className="flex-1" disabled={pending} onClick={() => answer(() => decline(invitation.token), () => setDeclined(true))}>Decline</Button>
        <Button variant="primary" className="flex-1" disabled={pending || alreadyMember} onClick={() => answer(() => accept(invitation.token))}>{pending ? "Joining…" : "Join workspace"}</Button>
      </div>
    </Card>
  );
}

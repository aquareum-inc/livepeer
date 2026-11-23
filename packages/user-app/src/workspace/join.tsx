"use client";

import type { WorkspaceInvitation } from "@livepeer/api-client/provider";
import { Button, Card, EmptyState } from "@livepeer/ui";
import { BadgeCheck, Coins, MailX, UserRound, type LucideIcon } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

import { useLink } from "../shell/link";
import { PersonMark, ROLE_FOR_YOU, WorkspaceMark, type Outcome } from "./shared";

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

function Fact({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="size-3.5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="text-body font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-caption text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

function daysLeft(invitation: WorkspaceInvitation): string {
  const days = Math.ceil((Date.parse(invitation.expires_at) - Date.now()) / 86_400_000);
  return days <= 1 ? "This invitation ends today." : `This invitation is open for ${days} more days.`;
}

/**
 * Where an invitation link lands. One decision, alone in the middle of the page: which workspace and who
 * asked, what joining changes, then join or decline.
 */
export function JoinWorkspace({ invitation, alreadyMember, accept, decline }: JoinWorkspaceProps) {
  const Link = useLink();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  const home = <Button asChild><Link href="/">Back to Home</Link></Button>;
  const frame = (content: ReactNode) => <div className="flex flex-1 items-center justify-center px-4 py-10"><div className="w-full max-w-[440px]">{content}</div></div>;

  if (!invitation) {
    return frame(<EmptyState icon={MailX} title="This link isn't an invitation" body="Check it was copied in full, or ask whoever invited you to send it again." action={home} />);
  }
  if (declined || invitation.status !== "pending") {
    return frame(
      <EmptyState
        icon={MailX}
        title={declined ? "Invitation declined" : "This invitation is no longer open"}
        body={declined ? `You haven't joined ${invitation.workspace_name}. ${invitation.invited_by_name} can invite you again if you change your mind.` : `${CLOSED[invitation.status as keyof typeof CLOSED]} Ask ${invitation.invited_by_name} for a new one.`}
        action={home}
      />,
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
  const role = invitation.role === "admin" ? "an admin" : "a member";

  return frame(
    <>
      <div className="flex flex-col items-center text-center">
        <WorkspaceMark name={invitation.workspace_name} className="mb-5 size-16 rounded-[18px] text-[26px]" />
        <p className="flex items-center gap-1.5 text-body text-muted-foreground">
          <PersonMark name={invitation.invited_by_name} className="size-5 text-[9px]" />
          {invitation.invited_by_name} invited you to join
        </p>
        <h1 className="mt-1.5 text-display font-semibold tracking-[-0.02em] text-foreground">{invitation.workspace_name}</h1>
      </div>

      <Card className="mt-7">
        <ul className="divide-y divide-hairline">
          <Fact icon={BadgeCheck} title={`You'll be ${role}`}>{ROLE_FOR_YOU[invitation.role]}</Fact>
          <Fact icon={Coins} title="One balance, one library">What you make here uses the workspace's credit and is saved where everyone in it can see.</Fact>
          <Fact icon={UserRound} title="Your own account stays as it is">Switch between the two from the account menu whenever you like.</Fact>
        </ul>
      </Card>

      {alreadyMember ? <p className="mt-4 text-center text-caption text-muted-foreground">You already belong to this workspace. Switch to it from the account menu.</p> : null}
      {error ? <p role="alert" className="mt-4 text-center text-caption text-destructive">{error}</p> : null}
      <div className="mt-5 flex gap-2">
        <Button variant="ghost" size="lg" disabled={pending} onClick={() => answer(() => decline(invitation.token), () => setDeclined(true))}>Decline</Button>
        <Button variant="primary" size="lg" className="min-w-0 flex-1" disabled={pending || alreadyMember} onClick={() => answer(() => accept(invitation.token))}>
          <span className="truncate">{pending ? "Joining…" : `Join ${invitation.workspace_name}`}</span>
        </Button>
      </div>
      <p className="mt-4 text-center text-caption text-subtle-foreground">{daysLeft(invitation)}</p>
    </>,
  );
}

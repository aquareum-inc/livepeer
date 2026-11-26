"use client";

import { OPERATOR_ROLE_COPY, type OperatorRole } from "@livepeer/api-client";
import { BrandSymbol, Button, type Brand } from "@livepeer/ui";
import { useState, type ReactNode } from "react";

/** What the page knows of the link. Anything but `waiting` says only that it can't be used. */
export type JoinTeamInvitation = { state: "waiting"; role: OperatorRole; invitedBy: string | null; expiresAt: string } | { state: "used" | "revoked" | "expired" | "unknown" };

export interface JoinTeamProps {
  brand: Brand;
  /** The instance's name. */
  instance: string;
  invitation: JoinTeamInvitation;
  /** Who is signed in, or null. */
  viewer: { name: string; email: string | null } | null;
  /** The viewer's role on the team already, if they have one. */
  current: OperatorRole | null;
  /** Whether the viewer signed in recently enough to accept. If not, they sign in again first. */
  fresh: boolean;
  /** Where to sign in and come back, and the same asking the provider for a new sign-in. */
  signInHref: string;
  signInAgainHref: string;
  /** Joins the team and opens the console. Answers only when it didn't happen. */
  accept: () => Promise<{ error: string }>;
  /** Signs out and returns here, to sign in as someone else. */
  switchAccount: ReactNode;
}

const GONE: Record<Exclude<JoinTeamInvitation["state"], "waiting">, string> = {
  used: "This invitation has already been used.",
  revoked: "This invitation was withdrawn.",
  expired: "This invitation has run out.",
  unknown: "This link isn't an invitation we know.",
};

const RANK: Record<OperatorRole, number> = { viewer: 0, member: 1, owner: 2 };
const a = (role: OperatorRole) => (role === "owner" ? "an owner" : `a ${role}`);

/** The page an invitation to the team opens: who is asking, what the role allows, and one thing to do. */
export function JoinTeam({ brand, instance, invitation, viewer, current, fresh, signInHref, signInAgainHref, accept, switchAccount }: JoinTeamProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      // On success the action redirects to the console, so an answer is always a refusal.
      const result = await accept();
      setError(result.error);
    } finally {
      setBusy(false);
    }
  };

  const waiting = invitation.state === "waiting" ? invitation : null;
  const nothingToGain = waiting && current && RANK[current] >= RANK[waiting.role];

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] rounded-sheet border border-hairline bg-card p-8 text-center">
        <BrandSymbol brand={brand} className="mx-auto h-7 w-auto" />
        {!waiting ? (
          <>
            <h1 className="mt-6 text-title font-semibold tracking-[-0.01em]">{GONE[invitation.state as keyof typeof GONE]}</h1>
            <p className="mt-2 text-body text-muted-foreground">Ask whoever invited you to {instance} for a new link.</p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-title font-semibold tracking-[-0.01em]">Join the team at {instance}</h1>
            <p className="mt-2 text-body text-muted-foreground">
              {waiting.invitedBy ? `${waiting.invitedBy} invited you` : "You've been invited"} to help run {instance} as {a(waiting.role)}.
            </p>
            <p className="mt-4 rounded-field bg-muted px-4 py-3 text-left text-body">
              <span className="font-medium">{OPERATOR_ROLE_COPY[waiting.role].name}.</span> <span className="text-muted-foreground">{OPERATOR_ROLE_COPY[waiting.role].can}</span>
            </p>

            {!viewer ? (
              <Button asChild variant="primary" size="lg" className="mt-6 w-full">
                <a href={signInHref}>Sign in to join</a>
              </Button>
            ) : nothingToGain ? (
              <>
                <p className="mt-6 text-body text-muted-foreground">You're already {a(current)} here, so this invitation wouldn't change anything.</p>
                <Button asChild variant="primary" size="lg" className="mt-4 w-full">
                  <a href="/operator">Open the console</a>
                </Button>
              </>
            ) : (
              <>
                <p className="mt-6 text-body">
                  You'll join as <span className="font-medium">{viewer.name}</span>
                  {viewer.email ? <span className="text-muted-foreground"> ({viewer.email})</span> : null}.
                </p>
                {error ? <p role="alert" className="mt-3 text-body text-destructive">{error}</p> : null}
                {fresh ? (
                  <Button variant="primary" size="lg" className="mt-4 w-full" disabled={busy} onClick={() => void join()}>
                    {busy ? "Joining…" : "Join the team"}
                  </Button>
                ) : (
                  <>
                    <Button asChild variant="primary" size="lg" className="mt-4 w-full">
                      <a href={signInAgainHref}>Sign in again to join</a>
                    </Button>
                    <p className="mt-2 text-caption text-muted-foreground">Joining the team asks for a sign-in from the last five minutes.</p>
                  </>
                )}
                <div className="mt-4 text-body text-muted-foreground">{switchAccount}</div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

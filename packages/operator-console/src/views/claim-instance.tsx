"use client";

import { OPERATOR_ROLE_COPY } from "@livepeer/api-client";
import { BrandSymbol, Button, type Brand } from "@livepeer/ui";
import { useState, type ReactNode } from "react";

export interface ClaimInstanceProps {
  brand: Brand;
  /** The instance's name. */
  instance: string;
  /** Who is signed in, and so who would become the owner. */
  viewer: { name: string; email: string | null };
  /** Makes the viewer the owner and opens the console. Answers only when it didn't happen. */
  claim: () => Promise<{ error: string }>;
  /** Signs out and returns here, to sign in as someone else. */
  switchAccount: ReactNode;
}

/**
 * The page the person who has just deployed an instance lands on when they open its console: nobody runs
 * it yet, and one button makes them its owner. It is shown only until someone has.
 */
export function ClaimInstance({ brand, instance, viewer, claim, switchAccount }: ClaimInstanceProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const become = async () => {
    setBusy(true);
    setError(null);
    try {
      // On success the action redirects to the console, so an answer is always a refusal.
      const result = await claim();
      setError(result.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] rounded-sheet border border-hairline bg-card p-8 text-center">
        <BrandSymbol brand={brand} className="mx-auto h-7 w-auto" />
        <h1 className="mt-6 text-title font-semibold tracking-[-0.01em]">Set up {instance}</h1>
        <p className="mt-2 text-body text-muted-foreground">Nobody runs this instance yet. Whoever sets it up becomes its owner, and that can be done once.</p>
        <p className="mt-4 rounded-field bg-muted px-4 py-3 text-left text-body">
          <span className="font-medium">{OPERATOR_ROLE_COPY.owner.name}.</span> <span className="text-muted-foreground">{OPERATOR_ROLE_COPY.owner.can}</span>
        </p>
        <p className="mt-6 text-body">
          You'll be the owner as <span className="font-medium">{viewer.name}</span>
          {viewer.email ? <span className="text-muted-foreground"> ({viewer.email})</span> : null}.
        </p>
        {error ? <p role="alert" className="mt-3 text-body text-destructive">{error}</p> : null}
        <Button variant="primary" size="lg" className="mt-4 w-full" disabled={busy} onClick={() => void become()}>
          {busy ? "Setting up…" : "Become the owner"}
        </Button>
        <p className="mt-2 text-caption text-muted-foreground">You can invite others to the team from the console afterwards.</p>
        <div className="mt-4 text-body text-muted-foreground">{switchAccount}</div>
      </div>
    </main>
  );
}

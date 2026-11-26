"use client";

import type { Plan } from "@livepeer/api-client";
import { Button, Sheet } from "@livepeer/ui";

import { count, usd } from "./format";

/** The plan someone has picked and not yet confirmed: a plan, "none" to remove the plan, or null for nothing picked. */
export type PlanChoice = Plan | "none" | null;

/** Asks before a plan changes. A plan sets what an account is billed, so a click on a chip alone never saves it. */
export function PlanChangeSheet({ choice, name, kind, current, busy, onClose, onConfirm }: {
  choice: PlanChoice;
  /** Whose plan it is: a person's name or a workspace's. */
  name: string;
  kind: "person" | "workspace";
  /** The name of the plan they are on now, or null for none. */
  current: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (planId: string | null) => void;
}) {
  const plan = choice === "none" || choice === null ? null : choice;
  const person = kind === "person";
  return (
    <Sheet
      open={choice !== null}
      onOpenChange={(open) => !open && onClose()}
      title={plan ? `Move ${name} to ${plan.name}?` : `Take ${name} off ${current ?? "its plan"}?`}
      description={
        plan
          ? `It starts at ${person ? "their" : "its"} next billing period. Until then ${person ? "they stay as they are" : "it stays as it is"}.`
          : `From ${person ? "their" : "its"} next billing period ${person ? "they pay for what they use from their" : "it pays for what it uses from its"} allocation, with no monthly allowance.`
      }
    >
      {plan ? (
        <dl className="mb-4 divide-y divide-hairline rounded-card border border-hairline bg-card text-[13px]">
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted-foreground">Price</dt>
            <dd className="font-mono">{usd(Number(plan.price.amount))} / {plan.interval}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted-foreground">Allowance</dt>
            <dd className="font-mono">{count(plan.allowance.credits)} credits / {plan.allowance.period}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted-foreground">Now on</dt>
            <dd>{current ?? "No plan"}</dd>
          </div>
        </dl>
      ) : null}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onClose}>Keep {current ?? "no plan"}</Button>
        <Button variant="primary" className="flex-1" disabled={busy} onClick={() => onConfirm(plan?.id ?? null)}>
          {plan ? "Change plan" : "Remove plan"}
        </Button>
      </div>
    </Sheet>
  );
}

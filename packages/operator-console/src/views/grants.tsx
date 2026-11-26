"use client";

import type { DataSource, Grant } from "@livepeer/api-client";
import { Button, Field, Input, Sheet } from "@livepeer/ui";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { dateTime, usd } from "../components/format";
import { ConsolePage, GapNote, Panel } from "../components/parts";
import { Table } from "../components/table";
import { useOperatorCan } from "../shell/role";

export interface GrantsViewProps {
  grants: Grant[];
  /** Set when the grants couldn't be read, with the reason to show. */
  unavailable: string | null;
  create: (input: { label: string; amountUsd: number }) => Promise<Grant>;
  fund: (id: string, amountUsd: number) => Promise<Grant>;
  sources: ReadonlyArray<{ name: string; source: DataSource }>;
}

export function GrantsView({ grants: initial, unavailable, create, fund, sources }: GrantsViewProps) {
  const can = useOperatorCan();
  const [grants, setGrants] = useState(initial);
  const [sheet, setSheet] = useState<{ mode: "create" } | { mode: "fund"; grant: Grant } | null>(null);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("100");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setSheet(null);
    setReview(false);
    setError(null);
    setLabel("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!sheet) return;
    if (!review) {
      setReview(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (sheet.mode === "create") {
        const created = await create({ label: label.trim(), amountUsd: Number(amount) });
        setGrants((current) => [...current, created]);
      } else {
        const funded = await fund(sheet.grant.id, Number(amount));
        setGrants((current) => current.map((grant) => (grant.id === funded.id ? funded : grant)));
      }
      close();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "That didn't go through. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConsolePage
      title="Grants"
      description="A grant is a pool of funding. Allocations are per-user budgets carved out of a grant."
      sources={sources}
      actions={can("manage_grants") ? <Button size="sm" variant="primary" disabled={unavailable !== null} onClick={() => setSheet({ mode: "create" })}><Plus />New grant</Button> : null}
    >
      {unavailable ? <GapNote>{unavailable}</GapNote> : null}
      <Panel title="All grants">
        <Table
          caption="Grants"
          rows={grants}
          rowKey={(grant) => grant.id}
          empty={unavailable ? "Grants can't be listed until the admin token is fixed." : "No grants yet. Create one to fund your first users."}
          columns={[
            { key: "label", header: "Grant", cell: (grant) => <span className="font-medium">{grant.label}</span> },
            { key: "funded", header: "Funded", cell: (grant) => usd(grant.funded.amount), mono: true, align: "right" },
            { key: "allocated", header: "Allocated", cell: (grant) => usd(grant.allocated.amount), mono: true, align: "right" },
            { key: "spent", header: "Spent", cell: (grant) => usd(grant.spent.amount), mono: true, align: "right" },
            { key: "free", header: "Unallocated", cell: (grant) => usd(Number(grant.funded.amount) - Number(grant.allocated.amount)), mono: true, align: "right", wide: true },
            { key: "created", header: "Created", cell: (grant) => dateTime(grant.created_at), mono: true, align: "right", wide: true },
            ...(can("manage_grants") ? [{ key: "act", header: "", align: "right" as const, cell: (grant: Grant) => <Button size="sm" variant="ghost" onClick={() => setSheet({ mode: "fund", grant })}>Add funding</Button> }] : []),
          ]}
        />
      </Panel>

      <Sheet
        open={sheet !== null}
        onOpenChange={(open) => !open && close()}
        title={review ? "Review" : sheet?.mode === "fund" ? `Add funding to ${sheet.grant.label}` : "New grant"}
        description={review ? "Check this before it's recorded. Funding can't be taken back out." : undefined}
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          {review ? (
            <dl className="divide-y divide-hairline rounded-card border border-hairline text-[13px]">
              <div className="flex h-10 items-center justify-between px-3"><dt className="text-muted-foreground">Grant</dt><dd>{sheet?.mode === "fund" ? sheet.grant.label : label}</dd></div>
              <div className="flex h-10 items-center justify-between px-3"><dt className="text-muted-foreground">{sheet?.mode === "fund" ? "Add" : "Fund with"}</dt><dd className="font-mono">{usd(amount)}</dd></div>
            </dl>
          ) : (
            <>
              {sheet?.mode === "create" ? <Field label="Name"><Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Launch credits" required /></Field> : null}
              <Field label="Amount (USD)"><Input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required className="font-mono" /></Field>
            </>
          )}
          {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            {review ? <Button className="flex-1" onClick={() => setReview(false)}>Back</Button> : null}
            <Button type="submit" variant="primary" className="flex-1" disabled={busy || Number(amount) <= 0 || (sheet?.mode === "create" && label.trim() === "")}>
              {busy ? "Recording…" : review ? "Confirm" : "Review"}
            </Button>
          </div>
        </form>
      </Sheet>
    </ConsolePage>
  );
}

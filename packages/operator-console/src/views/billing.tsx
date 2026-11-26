"use client";

import type { BillingSettings, DataSource, Payment } from "@livepeer/api-client";
import { Button, Sheet, Switch } from "@livepeer/ui";
import { useState } from "react";

import { dateTime, usd } from "../components/format";
import { ConsolePage, Panel, Status } from "../components/parts";
import { Table } from "../components/table";
import { OwnersOnly, useOperatorCan } from "../shell/role";

export interface BillingViewProps {
  settings: BillingSettings;
  payments: Payment[];
  update: (patch: Partial<BillingSettings>) => Promise<BillingSettings>;
  refund: (id: string) => Promise<Payment | null>;
  sources: ReadonlyArray<{ name: string; source: DataSource }>;
}

export function BillingView({ settings: initial, payments: initialPayments, update, refund, sources }: BillingViewProps) {
  const can = useOperatorCan();
  const [settings, setSettings] = useState(initial);
  const [payments, setPayments] = useState(initialPayments);
  const [refunding, setRefunding] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const failed = payments.filter((payment) => payment.status === "failed");

  const save = async (patch: Partial<BillingSettings>) => {
    setBusy(true);
    try {
      setSettings(await update(patch));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConsolePage title="Billing" description="Collecting money from your users: the processor, payments, refunds and tax." sources={sources} note="Billing is simulated. Whether the payment provider or this app collects payment from end users is an open question for the engine's builders, so nothing here moves real money.">

      <OwnersOnly allowed={can("set_pricing")} what="how payment is collected">
      <Panel title="Payment processor">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-card px-4 py-3">
          <div>
            <p className="text-[13px] font-medium">{settings.processor.connected ? settings.processor.name : "Not connected"}</p>
            <p className="text-[12px] text-muted-foreground">{settings.processor.connected ? "Card payments for plans and credit packs go through this processor." : "Connect a card processor to sell plans and credit packs."}</p>
          </div>
          <Button size="sm" variant={settings.processor.connected ? "outline" : "primary"} disabled={busy} onClick={() => save({ processor: settings.processor.connected ? { connected: false, name: null } : { connected: true, name: "Card processor (test mode)" } })}>
            {settings.processor.connected ? "Disconnect" : "Connect"}
          </Button>
        </div>
      </Panel>

      <Panel title="Tax and currency">
        <div className="divide-y divide-hairline rounded-card border border-hairline bg-card">
          <div className="flex h-11 items-center justify-between px-4 text-[13px]">
            <span>Currency</span>
            <span className="font-mono text-[12px] text-muted-foreground">{settings.currency}</span>
          </div>
          <div className="flex h-11 items-center justify-between px-4 text-[13px]">
            <span>Collect tax at checkout</span>
            <Switch checked={settings.collect_tax} disabled={busy} onCheckedChange={(collect_tax) => save({ collect_tax })} aria-label="Collect tax at checkout" />
          </div>
        </div>
      </Panel>
      </OwnersOnly>

      {failed.length > 0 ? (
        <Panel title="Failed payments" description="These users' plans weren't renewed. Suspend them, or add credit while they sort it out.">
          <Table
            caption="Failed payments"
            rows={failed}
            rowKey={(payment) => payment.id}
            empty=""
            columns={[
              { key: "user", header: "User", cell: (payment) => payment.user_name },
              { key: "what", header: "For", cell: (payment) => payment.description },
              { key: "amount", header: "Amount", cell: (payment) => usd(payment.amount.amount), mono: true, align: "right" },
              { key: "when", header: "Attempted", cell: (payment) => dateTime(payment.created_at), mono: true, align: "right" },
            ]}
          />
        </Panel>
      ) : null}

      <Panel title="Payments and invoices">
        <Table
          caption="Payments"
          rows={payments}
          rowKey={(payment) => payment.id}
          empty="No payments yet."
          columns={[
            { key: "user", header: "User", cell: (payment) => payment.user_name },
            { key: "what", header: "For", cell: (payment) => payment.description, wide: true },
            { key: "status", header: "Status", cell: (payment) => <Status value={payment.status} /> },
            { key: "invoice", header: "Invoice", cell: (payment) => payment.invoice_id ?? "—", mono: true, wide: true },
            { key: "amount", header: "Amount", cell: (payment) => usd(payment.amount.amount), mono: true, align: "right" },
            { key: "when", header: "Date", cell: (payment) => dateTime(payment.created_at), mono: true, align: "right", wide: true },
            ...(can("adjust_account") ? [{ key: "act", header: "", align: "right" as const, cell: (payment: Payment) => (payment.status === "paid" ? <Button size="sm" variant="ghost" onClick={() => setRefunding(payment)}>Refund</Button> : null) }] : []),
          ]}
        />
      </Panel>

      <Sheet
        open={refunding !== null}
        onOpenChange={(open) => !open && setRefunding(null)}
        title={`Refund ${refunding ? usd(refunding.amount.amount) : ""} to ${refunding?.user_name ?? ""}?`}
        description="The full amount goes back to their card. This can't be undone."
      >
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setRefunding(null)}>Cancel</Button>
          <Button
            variant="destructive" className="flex-1"
            onClick={async () => {
              const result = refunding ? await refund(refunding.id) : null;
              if (result) setPayments((current) => current.map((payment) => (payment.id === result.id ? result : payment)));
              setRefunding(null);
            }}
          >
            Refund
          </Button>
        </div>
      </Sheet>
    </ConsolePage>
  );
}

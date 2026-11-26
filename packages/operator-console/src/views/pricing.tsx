"use client";

import type { CreditPack, DataSource, Plan, ProviderFeatures, TopUpRange } from "@livepeer/api-client";
import { Badge, Button, Field, Input, Sheet, Switch, Textarea } from "@livepeer/ui";
import { Check, ChevronRight, Minus, Plus } from "lucide-react";
import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";

import { CreditPacks, type SaveCreditPack } from "../components/credit-packs";
import { count, usd } from "../components/format";
import { ConsolePage, GapNote, Panel } from "../components/parts";
import { Table } from "../components/table";
import { OwnersOnly, useOperatorCan } from "../shell/role";

export interface PricingViewProps {
  provider: { name: string; features: ProviderFeatures };
  plans: Plan[];
  packs: CreditPack[];
  /** Top-ups of the user's own amount: on or off, and the limits. */
  topUp: TopUpRange;
  markup: { default: number; creditsPerUsd: number; perApp: Record<string, number> };
  savePlan: (id: string | null, input: Omit<Plan, "id">) => Promise<Plan>;
  savePack: SaveCreditPack;
  saveTopUp: (range: TopUpRange) => Promise<{ ok: true; range: TopUpRange } | { ok: false; error: string }>;
  sources: ReadonlyArray<{ name: string; source: DataSource }>;
  Link: ComponentType<{ href: string; className?: string; children: ReactNode }>;
}

const FEATURE_LABELS: Array<[keyof ProviderFeatures, string]> = [
  ["users", "Users"],
  ["grants", "Grants"],
  ["plans", "Plans"],
  ["allowances", "Allowances"],
  ["credit_packs", "Credit packs"],
  ["custom_top_up", "Other amounts"],
  ["invoices", "Invoices"],
  ["oidc", "Sign-in (OIDC)"],
];

const BLANK: Omit<Plan, "id"> = {
  name: "",
  description: "",
  price: { amount: "0.00", currency: "USD" },
  interval: "month",
  allowance: { credits: 1000, period: "month", rollover_months: 0 },
  features: [],
  markup: null,
  active: true,
};

/** One figure in the Markup strip. */
function Stat({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-1 px-4 py-3">
      <p className="flex items-center justify-between gap-2 text-[12px] text-subtle-foreground">
        {label}
        {icon}
      </p>
      <p className="font-mono text-[18px] font-semibold leading-6">{value}</p>
    </div>
  );
}

/** Whether users can top up an amount of their own, and between what limits. Saved separately from plans. */
function OtherAmounts({ initial, save }: { initial: TopUpRange; save: PricingViewProps["saveTopUp"] }) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState({ enabled: initial.enabled, min: initial.min.amount, max: initial.max.amount });
  const [state, setState] = useState<{ kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string }>({ kind: "idle" });
  const dirty = value.enabled !== saved.enabled || Number(value.min) !== Number(saved.min.amount) || Number(value.max) !== Number(saved.max.amount);
  const currency = saved.min.currency;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState({ kind: "saving" });
    const result = await save({ enabled: value.enabled, min: { amount: Number(value.min).toFixed(2), currency }, max: { amount: Number(value.max).toFixed(2), currency } }).catch(() => ({ ok: false as const, error: "The limits weren't saved." }));
    if (result.ok) {
      setSaved(result.range);
      setState({ kind: "idle" });
    } else setState({ kind: "error", message: result.error });
  };

  return (
    <form onSubmit={submit} className="mt-3 rounded-card border border-hairline bg-card">
      <div className="flex min-h-[48px] items-center justify-between gap-4 px-4 py-2">
        <div>
          <p className="text-[13px] font-medium">Other amounts</p>
          <p className="text-[12px] text-muted-foreground">Users can type their own top-up, priced at the rate of the largest pack it reaches.</p>
        </div>
        <Switch checked={value.enabled} onCheckedChange={(enabled) => setValue((current) => ({ ...current, enabled }))} aria-label="Let users choose their own amount" />
      </div>
      {value.enabled ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-hairline px-4 py-3">
          <Field label={`Minimum (${currency})`}><Input type="number" min="1" step="1" value={value.min} onChange={(event) => setValue((current) => ({ ...current, min: event.target.value }))} className="w-28 font-mono" required /></Field>
          <Field label={`Maximum (${currency})`}><Input type="number" min="1" step="1" value={value.max} onChange={(event) => setValue((current) => ({ ...current, max: event.target.value }))} className="w-28 font-mono" required /></Field>
          <p className="pb-2.5 text-[12px] text-muted-foreground">Card processors have minimum charges, and fees make small top-ups a loss.</p>
        </div>
      ) : null}
      {dirty || state.kind === "error" ? (
        <div className="flex items-center gap-3 border-t border-hairline px-4 py-2.5">
          <Button type="submit" size="sm" variant="primary" disabled={!dirty || state.kind === "saving"}>{state.kind === "saving" ? "Saving…" : "Save"}</Button>
          {state.kind === "error" ? <p role="alert" className="text-[12px] text-destructive">{state.message}</p> : null}
        </div>
      ) : null}
    </form>
  );
}

export function PricingView({ provider, plans: initial, packs, topUp, markup, savePlan, savePack, saveTopUp, sources, Link }: PricingViewProps) {
  const can = useOperatorCan();
  const overrides = Object.values(markup.perApp);
  const [plans, setPlans] = useState(initial);
  const [editing, setEditing] = useState<{ id: string | null; value: Omit<Plan, "id"> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await savePlan(editing.id, editing.value);
      setPlans((current) => (editing.id ? current.map((plan) => (plan.id === saved.id ? saved : plan)) : [...current, saved]));
      setEditing(null);
    } catch {
      setError("The plan wasn't saved. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const set = (patch: Partial<Omit<Plan, "id">>) => setEditing((current) => (current ? { ...current, value: { ...current.value, ...patch } } : current));

  return (
    <ConsolePage title="Pricing and plans" description="How wholesale network cost becomes what your users pay." sources={sources}>
      <OwnersOnly allowed={can("set_pricing")} what="pricing">
      <Panel title="Payment provider" description={`Connected: ${provider.name}`}>
        <div className="flex flex-wrap gap-1.5 rounded-card border border-hairline bg-card p-3">
          {FEATURE_LABELS.map(([key, text]) => (
            <Badge key={key} tone={provider.features[key] ? "live" : "neutral"}>
              {provider.features[key] ? <Check className="size-3" /> : <Minus className="size-3" />}
              {text}
            </Badge>
          ))}
        </div>
      </Panel>

      <Panel title="Markup" description="A retail price is the wholesale cost times a markup, converted to credits. Set in instance.config.json under pricing.">
        <div className="grid overflow-hidden rounded-card border border-hairline bg-card max-sm:divide-y max-sm:divide-hairline sm:grid-cols-3 sm:divide-x sm:divide-hairline">
          <Stat label="Default markup" value={`${markup.default.toFixed(2)}×`} />
          <Stat label="Credits per dollar" value={count(markup.creditsPerUsd)} />
          <Link href="/operator/capabilities" className="group block transition-colors duration-150 hover:bg-hover">
            <Stat
              label="Markup overrides"
              icon={<ChevronRight className="size-3.5 text-subtle-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />}
              value={overrides.length === 0 ? "None" : count(overrides.length)}
            />
          </Link>
        </div>
      </Panel>

      <Panel
        title="Plans"
        description="The provider's plans and their monthly allowances. Assign one from a user's page."
        actions={provider.features.plans ? <Button size="sm" onClick={() => setEditing({ id: null, value: BLANK })}><Plus />New plan</Button> : null}
      >
        {provider.features.plans ? (
          <Table
            caption="Plans"
            rows={plans}
            rowKey={(plan) => plan.id}
            empty="No plans yet. Create one to offer a monthly allowance."
            columns={[
              { key: "name", header: "Plan", cell: (plan) => <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setEditing({ id: plan.id, value: plan })}>{plan.name}</button> },
              { key: "price", header: "Price", cell: (plan) => `${usd(plan.price.amount, 0)} / ${plan.interval}`, mono: true, align: "right" },
              { key: "allowance", header: "Allowance", cell: (plan) => `${count(plan.allowance.credits)} / ${plan.allowance.period}`, mono: true, align: "right" },
              { key: "rollover", header: "Rollover", cell: (plan) => (plan.allowance.rollover_months ? `${plan.allowance.rollover_months} mo` : "none"), mono: true, align: "right", wide: true },
              { key: "markup", header: "Markup", cell: (plan) => (plan.markup ? `${plan.markup.toFixed(2)}×` : "default"), mono: true, align: "right", wide: true },
              { key: "active", header: "Offered", cell: (plan) => (plan.active ? "Yes" : "No"), align: "right" },
            ]}
          />
        ) : (
          <GapNote>{provider.name} doesn't support plans. Users pay for what they use from their allocation.</GapNote>
        )}
      </Panel>

      <CreditPacks initial={packs} editable={provider.features.credit_packs} providerName={provider.name} creditsPerUsd={markup.creditsPerUsd} save={savePack}>
        {provider.features.custom_top_up ? (
          <OtherAmounts initial={topUp} save={saveTopUp} />
        ) : (
          <p className="mt-2 text-[12px] text-muted-foreground">{provider.name} doesn't take top-ups of an amount the user chooses.</p>
        )}
      </CreditPacks>
      </OwnersOnly>

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} title={editing?.id ? "Edit plan" : "New plan"}>
        {editing ? (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Name"><Input value={editing.value.name} onChange={(event) => set({ name: event.target.value })} required /></Field>
            <Field label="Description"><Textarea rows={2} value={editing.value.description} onChange={(event) => set({ description: event.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price per month (USD)">
                <Input type="number" min="0" step="1" value={editing.value.price.amount} onChange={(event) => set({ price: { amount: Number(event.target.value || 0).toFixed(2), currency: "USD" } })} />
              </Field>
              <Field label="Credits per month">
                <Input type="number" min="0" step="100" value={editing.value.allowance.credits} onChange={(event) => set({ allowance: { ...editing.value.allowance, credits: Number(event.target.value || 0) } })} />
              </Field>
              <Field label="Rollover (months)">
                <Input type="number" min="0" max="12" value={editing.value.allowance.rollover_months} onChange={(event) => set({ allowance: { ...editing.value.allowance, rollover_months: Number(event.target.value || 0) } })} />
              </Field>
              <Field label="Markup" hint="Blank uses the default.">
                <Input type="number" min="1" step="0.05" value={editing.value.markup ?? ""} onChange={(event) => set({ markup: event.target.value ? Number(event.target.value) : null })} />
              </Field>
            </div>
            <label className="flex items-center justify-between py-1 text-body">
              Offer this plan to users
              <Switch checked={editing.value.active} onCheckedChange={(active) => set({ active })} aria-label="Offer this plan to users" />
            </label>
            {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
            <Button type="submit" variant="primary" disabled={busy || editing.value.name.trim() === ""}>{busy ? "Saving…" : "Save plan"}</Button>
          </form>
        ) : null}
      </Sheet>
    </ConsolePage>
  );
}

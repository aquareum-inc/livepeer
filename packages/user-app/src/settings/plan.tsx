"use client";

import type { CreditBalance, Money, Plan, PlanAndCredits } from "@livepeer/api-client";
import { topUpCredits } from "@livepeer/api-client/provider";
import { Badge, Button, Card, RollingNumber, Section, Sheet, cn } from "@livepeer/ui";
import { Check, Coins } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { planLadder } from "../lib/plan-ladder";
import { useCredits } from "../shell/credits";

export interface PlanSettingsProps {
  account: PlanAndCredits;
  balance: CreditBalance;
  buyPack: (packId: string) => Promise<CreditBalance>;
  /** A top-up of the user's own amount; offered when the account has a top-up range. */
  buyCredits: (amount: Money) => Promise<CreditBalance>;
  changePlan: (planId: string | null) => Promise<PlanAndCredits["plan"]>;
  /**
   * In a workspace where the reader isn't the owner: the workspace and its owner. The plan and balance are
   * shown, and nothing can be bought or changed.
   */
  readOnly?: { workspace: string; owner: string } | null;
}

const money = (amount: string, currency: string) => new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: Number(amount) % 1 === 0 ? 0 : 2 }).format(Number(amount));
const count = (value: number) => new Intl.NumberFormat("en").format(value);
const symbol = (currency: string) => new Intl.NumberFormat("en", { style: "currency", currency }).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency;

/**
 * What a plan card is made of, stepping up with the tier: the plain card for the first plan, a
 * lifted surface for the middle, and lit glass over the aurora for the top, with an edge running
 * from brand green into teal. The materials are the product's own (Home's glass and aurora), so the
 * top plan feels like the product at its fullest. By position, so it suits any operator's plans.
 */
type Material = "plain" | "lifted" | "lit";

function materialFor(tier: number, tiers: number): Material {
  if (tiers > 1 && tier === tiers) return "lit";
  return tier === 1 ? "plain" : "lifted";
}

/** A percentage scaled by the theme's aurora strength (gentler on the light theme). */
const k = (percent: number) => `calc(${percent}% * var(--aurora-strength))`;

/** An edge that runs through the given colours, over a fill: the fill paints the padding box, the gradient shows through a transparent border. */
const edged = (fill: string, stops: string) => `linear-gradient(${fill}, ${fill}) padding-box, linear-gradient(140deg, ${stops}) border-box`;

const SURFACE: Record<Material, { className?: string; style?: CSSProperties }> = {
  plain: {},
  lifted: {
    className: "border-transparent",
    style: {
      background: edged("var(--surface-lifted)", `color-mix(in oklch, var(--brand) ${k(45)}, var(--surface-lifted-edge)), var(--surface-lifted-edge) 45%`),
      boxShadow: "var(--surface-lifted-depth)",
    },
  },
  lit: {
    className: "border-transparent",
    style: {
      background: edged("var(--card)", `color-mix(in oklch, var(--brand) ${k(60)}, transparent), color-mix(in oklch, var(--aurora-teal) ${k(40)}, transparent) 40%, color-mix(in oklch, var(--foreground) 10%, transparent) 75%`),
      boxShadow: "var(--glass-depth)",
    },
  },
};

/**
 * The aurora inside a card, frosted under blur: green alone on the middle plan, green, teal and a
 * trace of violet on the top one, which also gets a sheen that crosses it while its button is hovered.
 */
function Aurora({ full }: { full: boolean }) {
  const fields = full
    ? [
        `radial-gradient(ellipse 70% 34% at 15% 0%, color-mix(in oklch, var(--brand) ${k(34)}, transparent), transparent 72%)`,
        `radial-gradient(ellipse 65% 30% at 88% 0%, color-mix(in oklch, var(--aurora-teal) ${k(28)}, transparent), transparent 72%)`,
        `radial-gradient(ellipse 40% 22% at 50% 0%, color-mix(in oklch, var(--aurora-violet) ${k(14)}, transparent), transparent 72%)`,
      ]
    : [`radial-gradient(ellipse 75% 30% at 30% 0%, color-mix(in oklch, var(--brand) ${k(20)}, transparent), transparent 72%)`];
  return (
    <>
      {/* Dark theme: soft fields of light, frosted. Rounded itself: Chrome doesn't clip backdrop blur to a parent's rounded corners. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 rounded-[inherit] light:hidden" style={{ background: fields.join(", ") }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] backdrop-blur-xl backdrop-saturate-150 light:hidden" />
      {/* Light theme: on white, fields read as smudges, so one even wash across the top instead, fading down. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 hidden h-40 rounded-t-[inherit] [mask-image:linear-gradient(to_bottom,black,transparent)] light:block"
        style={{
          background: full
            ? `linear-gradient(90deg, color-mix(in oklch, var(--brand) ${k(22)}, transparent), color-mix(in oklch, var(--aurora-teal) ${k(20)}, transparent))`
            : `color-mix(in oklch, var(--brand) ${k(14)}, transparent)`,
        }}
      />
      {full ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full transition-transform duration-[1400ms] ease-out-expo group-has-[button:hover]/plan:translate-x-full group-has-[button:focus-visible]/plan:translate-x-full motion-reduce:hidden"
          style={{ background: "linear-gradient(105deg, transparent 35%, color-mix(in oklch, var(--foreground) 6%, transparent) 50%, transparent 65%)" }}
        />
      ) : null}
    </>
  );
}

/**
 * Light along a plan card's top edge, a little stronger for each tier, so the plans read as a
 * progression without the page claiming one is "most popular". The current plan glows most, and a
 * card brightens while its button is hovered or focused: the light follows the choice, not the card,
 * since only the button does anything. Brand green here is expression, never a control.
 */
function TierLight({ step, strong }: { step: number; strong: boolean }) {
  const glow = strong ? 26 : Math.round(6 + step * 12);
  const edge = strong ? 70 : Math.round(20 + step * 35);
  const radial = (amount: number) => `radial-gradient(ellipse 80% 100% at 50% 0%, color-mix(in oklch, var(--brand) ${k(amount)}, transparent), transparent 70%)`;
  const line = (amount: number) => `linear-gradient(90deg, transparent, color-mix(in oklch, var(--brand) ${k(amount)}, transparent), transparent)`;
  const lit = "pointer-events-none absolute opacity-0 transition-opacity duration-300 ease-out-expo group-has-[button:hover]/plan:opacity-100 group-has-[button:focus-visible]/plan:opacity-100";
  return (
    <>
      {/* The glow is for the dark theme; on white it smudges, so the light theme keeps only the edge line. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 light:hidden" style={{ background: radial(glow) }} />
      <div aria-hidden className={`${lit} inset-x-0 top-0 -z-10 h-40 light:hidden`} style={{ background: radial(Math.min(34, glow + 12)) }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px" style={{ background: line(edge) }} />
      <div aria-hidden className={`${lit} inset-x-3 top-0 h-px`} style={{ background: line(Math.min(90, edge + 30)) }} />
    </>
  );
}

/** What a plan gives each period, with a bar against the largest plan so the difference in size reads at a glance. */
function Allowance({ allowance, scale }: { allowance: Plan["allowance"]; scale: number }) {
  return (
    <div className="mt-4">
      <p className="text-body font-medium">
        <span className="tabular-nums">{count(allowance.credits)}</span> credits a {allowance.period}
      </p>
      <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-brand-fill/70" style={{ width: `${Math.max(4, scale * 100)}%` }} />
      </div>
    </div>
  );
}

/** The budget as a bar: what is left, in brand green, with the figures beneath. */
function BudgetMeter({ allowance }: { allowance: CreditBalance["allowance"] }) {
  const granted = Number(allowance.granted);
  const left = granted > 0 ? Math.min(1, Math.max(0, Number(allowance.available) / granted)) : 0;
  return (
    <div className="mt-3 max-w-[360px]">
      {granted > 0 ? (
        <div
          role="meter"
          aria-label="Budget remaining"
          aria-valuemin={0}
          aria-valuemax={granted}
          aria-valuenow={Number(allowance.available)}
          aria-valuetext={`${money(allowance.available, allowance.currency)} of ${money(allowance.granted, allowance.currency)} left`}
          className="h-1.5 overflow-hidden rounded-full bg-secondary"
        >
          <div className="h-full rounded-full bg-brand-fill transition-[width] duration-500 ease-out-expo" style={{ width: `${left * 100}%` }} />
        </div>
      ) : null}
      <p className="mt-2 flex justify-between gap-4 font-mono text-[11px] text-subtle-foreground">
        <span>{money(allowance.available, allowance.currency)} left</span>
        <span>{money(allowance.spent, allowance.currency)} of {money(allowance.granted, allowance.currency)} spent</span>
      </p>
    </div>
  );
}

export function PlanSettings({ account, balance: initialBalance, buyPack, buyCredits, changePlan, readOnly = null }: PlanSettingsProps) {
  const { credits, add } = useCredits();
  const [plan, setPlan] = useState(account.plan);
  const [allowance, setAllowance] = useState(initialBalance.allowance);
  const [buying, setBuying] = useState(false);
  const [packId, setPackId] = useState(account.packs.find((pack) => pack.popular)?.id ?? account.packs[0]?.id ?? null);
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState("");
  const amountRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { features } = account.provider;
  const range = account.top_up;

  // What the chosen top-up costs and gives, for the preview and the button.
  const value = Number(amount);
  const inRange = range !== null && amount.trim() !== "" && Number.isFinite(value) && value >= Number(range.min.amount) && value <= Number(range.max.amount);
  const pack = custom ? null : account.packs.find((entry) => entry.id === packId) ?? null;
  const charge = custom ? (inRange && range ? money(value.toFixed(2), range.min.currency) : null) : pack ? money(pack.price.amount, pack.price.currency) : null;

  useEffect(() => {
    if (custom) amountRef.current?.focus();
  }, [custom]);

  const purchase = async () => {
    if (custom ? !inRange || !range : !pack) return;
    setBusy("pack");
    setError(null);
    try {
      const next = custom && range ? await buyCredits({ amount: value.toFixed(2), currency: range.min.currency }) : await buyPack(packId as string);
      add(next.credits - credits);
      setAllowance(next.allowance);
      setBuying(false);
    } catch {
      setError("The purchase didn't go through. You weren't charged.");
    } finally {
      setBusy(null);
    }
  };

  const choose = async (planId: string | null) => {
    setBusy(planId ?? "cancel");
    setError(null);
    try {
      setPlan(await changePlan(planId));
    } catch {
      setError("Your plan wasn't changed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card className="mb-8 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-[240px] flex-1">
          <p className="text-caption font-medium text-subtle-foreground">Credit balance</p>
          <p className="mt-1 flex items-center gap-2 text-display font-semibold tracking-[-0.02em]">
            <Coins className="size-6 text-subtle-foreground" aria-hidden />
            <RollingNumber value={credits} />
          </p>
          <BudgetMeter allowance={allowance} />
        </div>
        {readOnly ? (
          <p className="max-w-[260px] text-caption text-muted-foreground">
            This is {readOnly.workspace}'s credit. {readOnly.owner}, its owner, adds credit and chooses the plan.
          </p>
        ) : features.credit_packs && account.packs.length > 0 ? (
          <Button variant="primary" onClick={() => setBuying(true)}>Add credits</Button>
        ) : (
          <p className="max-w-[260px] text-caption text-muted-foreground">Credits on this instance are granted by its operator.</p>
        )}
      </Card>

      {error && !buying ? <p role="alert" className="mb-4 text-body text-destructive">{error}</p> : null}

      {features.plans && account.plans.length > 0 ? (
        <section className="@container">
          <h2 className="mb-3 text-body font-semibold">Plan</h2>
          {/* Three across only when the section has room for each price on one line; otherwise stacked, never two and one. */}
          <div className="grid gap-3 @min-[600px]:grid-cols-3">
            {planLadder(account.plans).map(({ plan: entry, tier, tiers, scale, previous, additions }) => {
              const current = plan?.id === entry.id;
              const material = materialFor(tier, tiers);
              const surface = SURFACE[material];
              return (
                <Card
                  key={entry.id}
                  className={cn("group/plan relative isolate flex flex-col overflow-hidden p-5", surface.className, current && material === "plain" && "border-[color-mix(in_oklch,var(--brand)_45%,var(--hairline))]")}
                  {...(surface.style ? { style: surface.style } : {})}
                >
                  {material === "plain" ? null : <Aurora full={material === "lit"} />}
                  <TierLight step={tier / tiers} strong={current} />
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lead font-semibold">{entry.name}</h3>
                    {current ? <Badge tone="live">{readOnly ? "Current plan" : "Your plan"}</Badge> : null}
                  </div>
                  <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-title font-semibold">
                    <span className="whitespace-nowrap tabular-nums">{money(entry.price.amount, entry.price.currency)}</span>
                    <span className="whitespace-nowrap text-body font-normal text-muted-foreground">/ {entry.interval}</span>
                  </p>
                  <p className="mt-1 text-caption text-muted-foreground">{entry.description}</p>
                  <Allowance allowance={entry.allowance} scale={scale} />
                  {previous ? <p className="mt-4 text-caption font-medium text-muted-foreground">Everything in {previous.name}, plus:</p> : null}
                  <ul className={cn("mb-4 flex flex-1 flex-col gap-2", previous ? "mt-2" : "mt-4")}>
                    {additions.map((feature) => (
                      <li key={feature} className="flex gap-2 text-caption text-foreground">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-brand/75" aria-hidden />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {readOnly ? null : (
                    <Button variant={current ? "outline" : "secondary"} disabled={busy !== null} onClick={() => choose(current ? null : entry.id)}>
                      {busy === entry.id || (current && busy === "cancel") ? "Updating…" : current ? "Cancel plan" : plan ? "Switch" : "Choose"}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      ) : (
        <Section title="Plan">
          <div className="px-4 py-4 text-body text-muted-foreground">
            {account.provider.name} doesn't offer plans. You pay for what you use from your credit balance.
          </div>
        </Section>
      )}

      <Sheet open={buying} onOpenChange={setBuying} title="Add credits" description="A one-off top-up. Credits don't expire.">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Amount">
          {account.packs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={!custom && packId === entry.id}
              onClick={() => {
                setCustom(false);
                setPackId(entry.id);
              }}
              className={cn(
                "relative rounded-media border px-4 py-3 text-left transition-[border-color,background-color,transform] duration-200 ease-out-expo active:scale-[0.98]",
                !custom && packId === entry.id ? "border-foreground bg-hover" : "border-hairline hover:bg-hover",
              )}
            >
              <span className="block text-lead font-semibold">{money(entry.price.amount, entry.price.currency)}</span>
              <span className="block font-mono text-caption text-muted-foreground">{count(entry.credits)} credits</span>
              {entry.popular ? <Badge className="absolute right-2 top-2">Popular</Badge> : null}
            </button>
          ))}
          {range ? (
            <div className={cn("col-span-2 rounded-media border transition-[border-color,background-color] duration-200 ease-out-expo", custom ? "border-foreground bg-hover" : "border-hairline hover:bg-hover")}>
              <button type="button" role="radio" aria-checked={custom} onClick={() => setCustom(true)} className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left">
                <span className="text-lead font-semibold">Other amount</span>
                <span className="font-mono text-caption text-muted-foreground">{money(range.min.amount, range.min.currency)} to {money(range.max.amount, range.max.currency)}</span>
              </button>
              {custom ? (
                <div className="flex items-center gap-3 px-4 pb-3">
                  <label className="flex h-11 min-w-0 flex-1 items-center gap-1 rounded-field border border-input bg-background px-3 transition-shadow focus-within:ring-1 focus-within:ring-ring">
                    <span className="text-lead text-muted-foreground">{symbol(range.min.currency)}</span>
                    <input
                      ref={amountRef}
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label={`Amount in ${range.min.currency}`}
                      aria-describedby="top-up-credits"
                      placeholder={String(Number(range.min.amount) * 4)}
                      value={amount}
                      onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.\d{0,2}).*$/, "$1"))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && inRange) void purchase();
                      }}
                      className="w-full min-w-0 bg-transparent text-lead font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-subtle-foreground"
                    />
                  </label>
                  <p id="top-up-credits" aria-live="polite" className={cn("w-[120px] shrink-0 text-right font-mono text-caption", inRange || amount.trim() === "" ? "text-muted-foreground" : "text-destructive")}>
                    {inRange
                      ? `${count(topUpCredits(value, account.packs, range.credits_per_usd))} credits`
                      : amount.trim() === ""
                        ? "Enter an amount"
                        : value > Number(range.max.amount)
                          ? `Up to ${money(range.max.amount, range.max.currency)}`
                          : `At least ${money(range.min.amount, range.min.currency)}`}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {error ? <p role="alert" className="mt-3 text-caption text-destructive">{error}</p> : null}
        <Button variant="primary" size="lg" className="mt-4 w-full" disabled={busy !== null || charge === null} onClick={purchase}>
          {busy === "pack" ? "Adding…" : charge ? `Add ${charge}` : "Add credits"}
        </Button>
      </Sheet>
    </>
  );
}

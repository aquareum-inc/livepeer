import type { DataSource } from "@livepeer/api-client";
import { Badge, cn, Tooltip } from "@livepeer/ui";
import { Info } from "lucide-react";
import { Fragment, type ReactNode } from "react";

/** A console page: dense header, optional actions, content. */
export function ConsolePage({ title, description, actions, sources, note, children }: {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Where this view's data comes from; shown beside the title. */
  sources?: ReadonlyArray<{ name: string; source: DataSource }>;
  /** What is simulated on this view and why. Shown from the source tag, so the page itself stays quiet. */
  note?: ReactNode;
  children: ReactNode;
}) {
  const live = sources?.filter((entry) => entry.source === "live").length ?? 0;
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-5 md:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold leading-7 tracking-[-0.01em]">{title}</h1>
            {sources && sources.length > 0 ? (
              <Tooltip
                side="bottom"
                className="max-w-[320px]"
                content={
                  <div className="flex flex-col gap-2 py-0.5">
                    {note ? <p>{note}</p> : null}
                    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 font-mono text-[11px]">
                      {sources.map((entry) => (
                        <Fragment key={entry.name}>
                          <dt className="text-muted-foreground">{entry.name}</dt>
                          <dd className={entry.source === "live" ? "text-brand" : "text-subtle-foreground"}>{entry.source}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  </div>
                }
              >
                <button type="button" className="group cursor-help rounded-full outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label={`Data sources${note ? " and what is simulated" : ""}`}>
                  <Badge tone={live > 0 ? "live" : "neutral"} className="gap-1 font-mono">
                    {live === sources.length ? "live" : live === 0 ? "mock" : "live + mock"}
                    {/* Says there is more to read; brightens when it's about to open. */}
                    <Info aria-hidden className="size-3 opacity-50 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </Badge>
                </button>
              </Tooltip>
            ) : null}
          </div>
          {description ? <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "positive" | "negative" | undefined }) {
  return (
    <div className="rounded-card border border-hairline bg-card px-4 py-3">
      <p className="text-[12px] text-subtle-foreground">{label}</p>
      <p className={cn("mt-1 text-[22px] font-semibold leading-7 tabular-nums tracking-[-0.01em]", tone === "positive" && "text-brand", tone === "negative" && "text-destructive")}>{value}</p>
      {hint ? <p className="mt-0.5 font-mono text-[11px] text-subtle-foreground">{hint}</p> : null}
    </div>
  );
}

export function Panel({ title, description, actions, children, className }: { title: string; description?: string | undefined; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("mb-6", className)}>
      <div className="mb-2 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-semibold">{title}</h2>
          {description ? <p className="text-[12px] text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

const STATUS_TONE: Record<string, "neutral" | "live" | "warn"> = {
  succeeded: "neutral",
  delivered: "neutral",
  active: "live",
  running: "live",
  ready: "live",
  ok: "live",
  paid: "neutral",
  allowed: "neutral",
  queued: "neutral",
  pending: "neutral",
  paused: "warn",
  failed: "warn",
  uncertain: "warn",
  revoked: "warn",
  exhausted: "warn",
  blocked: "warn",
  not_reaching: "warn",
  refunded: "neutral",
  failed_after_payment: "warn",
};

export function Status({ value }: { value: string }) {
  return <Badge tone={STATUS_TONE[value] ?? "neutral"}>{value.replace(/_/g, " ")}</Badge>;
}

/** A short notice inside a view, such as why a panel is empty. Page-wide caveats go in ConsolePage's note. */
export function GapNote({ children, className }: { children: ReactNode; className?: string }) {
  // A caption, not a box: quieter than the data it qualifies.
  return (
    <p className={cn("mb-4 flex max-w-[80ch] gap-2 text-[12px] leading-[18px] text-muted-foreground", className)}>
      <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-subtle-foreground" />
      <span>{children}</span>
    </p>
  );
}

import type { MemberUsageRow, UsageEntry, UsageSummary } from "@livepeer/api-client";
import { Badge, Card, EmptyState } from "@livepeer/ui";
import { KeyRound, ReceiptText } from "lucide-react";

import { offeringLabel } from "../lib/offering";
import { PersonMark, ROLE_LABEL } from "../workspace/shared";

const when = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const count = (value: number) => new Intl.NumberFormat("en").format(value);

const STATUS: Record<UsageEntry["status"], { label: string; tone: "neutral" | "warn" }> = {
  delivered: { label: "Delivered", tone: "neutral" },
  pending: { label: "Pending", tone: "neutral" },
  failed_after_payment: { label: "Failed after payment", tone: "warn" },
};

export interface UsageSettingsProps {
  summary: UsageSummary;
  entries: UsageEntry[];
  /** In a workspace: its name, and whether the figures are everyone's or only the reader's own. */
  workspace?: { name: string; scope: "everyone" | "own" } | null;
  /** A workspace's usage by member and API key, for its owner and admins. */
  byMember?: MemberUsageRow[] | null;
}

const WHO: Record<MemberUsageRow["kind"], (row: MemberUsageRow) => string> = {
  member: (row) => (row.role ? ROLE_LABEL[row.role] : "Member"),
  former_member: () => "No longer a member",
  key: () => "API key",
};

export function UsageSettings({ summary, entries, workspace = null, byMember = null }: UsageSettingsProps) {
  const note = workspace ? (
    <p className="mb-4 text-caption text-muted-foreground">
      {workspace.scope === "everyone" ? `Everything made in ${workspace.name}, by everyone and every API key.` : `What you've used in ${workspace.name}. Its owner and admins see everyone's.`}
    </p>
  ) : null;
  if (entries.length === 0) {
    return (
      <>
        {note}
        <EmptyState
          icon={ReceiptText}
          title="No usage yet"
          body={workspace?.scope === "everyone" ? "Each generation, analysis and session anyone runs here is listed with what it cost." : "Each generation, analysis and session you run is listed here with what it cost."}
        />
      </>
    );
  }
  const top = summary.by_app[0]?.credits ?? 1;
  const topMember = Math.max(1, ...(byMember ?? []).map((row) => row.credits));
  return (
    <>
      {note}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-caption text-subtle-foreground">Credits used</p>
          <p className="mt-1 text-title font-semibold tabular-nums">{count(summary.credits)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-caption text-subtle-foreground">Jobs run</p>
          <p className="mt-1 text-title font-semibold tabular-nums">{count(summary.jobs)}</p>
        </Card>
      </div>

      {byMember && byMember.length > 0 ? (
        <>
          <h2 className="mb-3 text-body font-semibold">By member</h2>
          <Card className="mb-8 divide-y divide-hairline">
            {byMember.map((row) => (
              <div key={`${row.kind}:${row.id}`} className="flex items-center gap-3 px-4 py-3">
                {row.kind === "key" ? (
                  <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-hairline"><KeyRound className="size-3.5" strokeWidth={1.75} /></span>
                ) : (
                  <PersonMark name={row.name} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0 truncate text-body font-medium">
                      {row.name} <span className="text-caption font-normal text-subtle-foreground">{WHO[row.kind](row)}</span>
                    </span>
                    <span className="shrink-0 font-mono text-caption text-muted-foreground">{count(row.credits)} credits · {row.jobs} jobs</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-foreground/70" style={{ width: `${row.credits === 0 ? 0 : Math.max(2, (row.credits / topMember) * 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : null}

      <h2 className="mb-3 text-body font-semibold">By capability</h2>
      <Card className="mb-8 divide-y divide-hairline">
        {summary.by_app.map((row) => (
          <div key={row.app} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-body font-medium">{offeringLabel(row.app)}</span>
              <span className="font-mono text-caption text-muted-foreground">{count(row.credits)} credits · {row.jobs} jobs</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(2, (row.credits / top) * 100)}%` }} />
            </div>
          </div>
        ))}
      </Card>

      <h2 className="mb-3 text-body font-semibold">Recent</h2>
      <Card className="divide-y divide-hairline">
        {entries.map((entry) => (
          <div key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
            <span className="min-w-0 flex-1 text-body">{offeringLabel(entry.app)}</span>
            {entry.status === "delivered" ? null : <Badge tone={STATUS[entry.status].tone}>{STATUS[entry.status].label}</Badge>}
            <span className="font-mono text-caption text-subtle-foreground">{when(entry.created_at)}</span>
            <span className="w-16 text-right font-mono text-caption text-foreground">{entry.credits}</span>
          </div>
        ))}
      </Card>
    </>
  );
}

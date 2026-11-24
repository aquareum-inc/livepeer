import type { OperatorAuditEntry, OperatorPhone } from "@livepeer/api-client";
import { X } from "lucide-react";
import type { ComponentType } from "react";

import { ago, dateTime } from "../components/format";
import { Panel, Status } from "../components/parts";
import { Table } from "../components/table";
import type { ConsoleLinkProps } from "../shell/console-shell";

const EVENT: Record<OperatorAuditEntry["event"], string> = { sign_in: "signed in", sign_out: "signed out", unlock: "unlocked", change: "changed", refused: "refused", revoked: "revoked", alert: "alerted" };

/** What operators' phones did, were refused and were told, newest first. */
export function PhoneActivityPanel({ entries }: { entries: OperatorAuditEntry[] }) {
  return (
    <Panel title="Phone activity" description="Every sign-in, unlock, change, refusal and revocation from an operator's phone, and every alert sent to one. Kept on this server.">
      <Table
        caption="Phone activity"
        rows={entries}
        rowKey={(entry) => entry.id}
        empty="Nothing yet. Activity from operators' phones appears here."
        columns={[
          { key: "at", header: "When", cell: (entry) => dateTime(entry.at), mono: true },
          { key: "event", header: "What", cell: (entry) => <Status value={EVENT[entry.event]} /> },
          {
            key: "who",
            header: "Operator",
            cell: (entry) => (
              <span className="flex flex-col whitespace-nowrap">
                <span>{entry.user_name}</span>
                <span className="font-mono text-[11px] text-subtle-foreground">{entry.device_name ?? "web console"}</span>
              </span>
            ),
          },
          { key: "operation", header: "Operation", cell: (entry) => entry.operation ?? <span className="text-subtle-foreground">—</span>, mono: true, wide: true },
          { key: "target", header: "On", cell: (entry) => entry.target ?? <span className="text-subtle-foreground">—</span>, mono: true, wide: true },
          { key: "detail", header: "Detail", cell: (entry) => entry.detail?.replace(/_/g, " ") ?? <span className="text-subtle-foreground">—</span>, wide: true },
        ]}
      />
    </Panel>
  );
}

/**
 * Said at the top of every console page when a phone is enrolled, so an addition nobody expected is seen,
 * until the operator reading it closes it or two days pass. Closing it is theirs alone: every other operator
 * still sees it, and so does whoever's account added the phone. `phones` are the ones this operator hasn't
 * closed, newest first; `dismiss` closes them all.
 */
export function NewPhoneNotice({ phones, dismiss, Link }: { phones: OperatorPhone[]; dismiss: () => Promise<void>; Link: ComponentType<ConsoleLinkProps> }) {
  const [latest] = phones;
  if (!latest) return null;
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pt-4 md:px-6">
      <div role="status" className="flex items-start gap-2 rounded-card border border-hairline bg-card py-1.5 pl-4 pr-1.5 text-[13px]">
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1">
          <p>
            {phones.length === 1 ? (
              <>
                <span className="font-medium">{latest.user_name}</span> added <span className="font-medium">{latest.name}</span> as an operator phone {ago(latest.created_at)}.
              </>
            ) : (
              <>{phones.length} operator phones were added in the last two days, the latest {ago(latest.created_at)}.</>
            )}{" "}
            <span className="text-muted-foreground">If you didn't expect {phones.length === 1 ? "it, revoke it" : "them, revoke them"}.</span>
          </p>
          <Link href="/operator/system#operator-phones" className="shrink-0 font-medium underline underline-offset-4">Operator phones</Link>
        </div>
        <form action={dismiss} className="shrink-0">
          <button
            type="submit"
            aria-label="Dismiss"
            title="Dismiss. Other operators still see this."
            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none transition-[background-color,color,transform] duration-200 hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.92]"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </form>
      </div>
    </div>
  );
}

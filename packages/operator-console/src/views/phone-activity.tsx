import type { OperatorAuditEntry, OperatorPhone } from "@livepeer/api-client";
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

/** Said on every console page for two days after a phone is enrolled, so an addition nobody expected is seen. */
export function NewPhoneNotice({ phones, Link }: { phones: OperatorPhone[]; Link: ComponentType<ConsoleLinkProps> }) {
  const [latest] = phones;
  if (!latest) return null;
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pt-4 md:px-6">
      <div role="status" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-card border border-hairline bg-card px-4 py-2.5 text-[13px]">
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
    </div>
  );
}

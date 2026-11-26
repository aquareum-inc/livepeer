"use client";

import type { CharacterReport, ReportReason } from "@livepeer/api-client";
import { Button, Sheet } from "@livepeer/ui";
import { useState } from "react";

import { dateTime } from "../components/format";
import { ConsolePage, GapNote, Panel, Status } from "../components/parts";
import { Table } from "../components/table";
import { useOperatorCan } from "../shell/role";

export interface ReportsViewProps {
  reports: CharacterReport[];
  resolve: (id: string, outcome: "dismissed" | "hidden") => Promise<CharacterReport[]>;
}

const REASON_LABEL: Record<ReportReason, string> = {
  sexual: "Sexual content",
  hateful: "Hateful or harassing",
  violent: "Violent or dangerous",
  impersonation: "Pretends to be a real person",
  spam: "Spam or a scam",
  other: "Something else",
};

const STATE_LABEL: Record<CharacterReport["state"], string> = { open: "open", dismissed: "kept up", hidden: "taken down" };

/** Reports of shared characters. The app stores require that each one gets a decision. */
export function ReportsView({ reports: initial, resolve }: ReportsViewProps) {
  const can = useOperatorCan();
  const [reports, setReports] = useState(initial);
  const [removing, setRemoving] = useState<CharacterReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = reports.filter((report) => report.state === "open");
  const decided = reports.filter((report) => report.state !== "open");

  const decide = async (report: CharacterReport, outcome: "dismissed" | "hidden") => {
    setBusy(report.id);
    setError(null);
    try {
      setReports(await resolve(report.id, outcome));
    } catch {
      setError("That didn't go through. Nothing was changed.");
    }
    setBusy(null);
    setRemoving(null);
  };

  const character = (report: CharacterReport) => (
    <span className="flex flex-col">
      <span className="font-medium">{report.character_name}</span>
      <span className="font-mono text-[11px] text-subtle-foreground">by {report.author}</span>
    </span>
  );

  return (
    <ConsolePage title="Reports" description="Shared characters people reported. Keep a character up, or take it off the instance for everyone.">
      <GapNote>The App Store and Google Play require that reports get a decision within the time you publish in your terms. People who report are never named.</GapNote>
      {error ? <p role="alert" className="mb-3 text-caption text-destructive">{error}</p> : null}
      <Panel title={open.length === 0 ? "Open" : `Open (${open.length})`}>
        <Table
          caption="Open reports"
          rows={open}
          rowKey={(report) => report.id}
          empty="Nothing waiting. New reports appear here."
          columns={[
            { key: "character", header: "Character", cell: character },
            { key: "reason", header: "Reason", cell: (report) => REASON_LABEL[report.reason] },
            { key: "note", header: "Their words", cell: (report) => report.note ?? <span className="text-subtle-foreground">—</span>, wide: true },
            { key: "created", header: "Reported", cell: (report) => dateTime(report.created_at), mono: true, align: "right", wide: true },
            ...(can("resolve_report") ? [{
              key: "act",
              header: "",
              align: "right" as const,
              cell: (report: CharacterReport) => (
                <span className="flex justify-end gap-1.5">
                  <Button size="sm" variant="ghost" disabled={busy === report.id} onClick={() => decide(report, "dismissed")}>Keep it up</Button>
                  <Button size="sm" variant="destructive" disabled={busy === report.id} onClick={() => setRemoving(report)}>Take it down</Button>
                </span>
              ),
            }] : []),
          ]}
        />
      </Panel>
      {decided.length > 0 ? (
        <Panel title="Decided" className="mt-4">
          <Table
            caption="Decided reports"
            rows={decided}
            rowKey={(report) => report.id}
            empty=""
            columns={[
              { key: "character", header: "Character", cell: character },
              { key: "reason", header: "Reason", cell: (report) => REASON_LABEL[report.reason] },
              { key: "created", header: "Reported", cell: (report) => dateTime(report.created_at), mono: true, wide: true },
              { key: "state", header: "Decision", align: "right", cell: (report) => <Status value={STATE_LABEL[report.state]} /> },
            ]}
          />
        </Panel>
      ) : null}

      <Sheet open={removing !== null} onOpenChange={(value) => !value && setRemoving(null)} title={`Take “${removing?.character_name ?? ""}” down?`} description="No one on this instance will see it again, and its other open reports close. Its author keeps their other characters.">
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setRemoving(null)}>Keep it up</Button>
          <Button variant="destructive" className="flex-1" disabled={busy !== null} onClick={() => removing && decide(removing, "hidden")}>Take it down</Button>
        </div>
      </Sheet>
    </ConsolePage>
  );
}

import type { DataSource, EngineHealth, OperatorAuditEntry } from "@livepeer/api-client";

import { ago } from "../components/format";
import { ConsolePage, Panel, Status } from "../components/parts";
import { Table } from "../components/table";
import { OperatorPhonesPanel, type OperatorPhonesProps } from "./operator-phones";
import { PhoneActivityPanel } from "./phone-activity";

export interface SystemCheck {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

export interface SystemViewProps {
  health: EngineHealth | null;
  healthError: string | null;
  provider: { name: string; id: string };
  versions: { app: string; enginePinned: string; engineRunning: string | null };
  checks: SystemCheck[];
  dataSources: Array<{ name: string; source: DataSource; area: string }>;
  sources: ReadonlyArray<{ name: string; source: DataSource }>;
  /** The phones enrolled for the console, and how to revoke them. */
  phones: OperatorPhonesProps;
  /** What those phones did and were refused, newest first. */
  phoneActivity: OperatorAuditEntry[];
  /** Whether the instance can send alerts to each kind of phone. Null while the console isn't offered on phones. */
  alerts: Array<{ to: string; detail: string }> | null;
}

export function SystemView({ health, healthError, provider, versions, checks, dataSources, sources, phones, phoneActivity, alerts }: SystemViewProps) {
  const passing = checks.filter((check) => check.ok).length;
  return (
    <ConsolePage title="System" description="Whether the instance, the engine and the payment provider are connected and healthy." sources={sources}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Connections">
          <dl className="divide-y divide-hairline rounded-card border border-hairline bg-card text-[13px]">
            {[
              ["Engine", health ? <Status key="e" value={health.ready ? "ready" : "failed"} /> : <Status key="e" value="failed" />],
              ["Discovery", health ? health.discovery_error ?? `fresh, ${ago(health.discovery_observed_at)}` : healthError ?? "unknown"],
              ["Cost sync", health ? health.cost_sync_error ?? ago(health.cost_sync_at) : "unknown"],
              ["Allocation mode", health?.allocation_mode ?? "unknown"],
              ["Payment provider", `${provider.name} (${provider.id})`],
              ...(alerts ?? []).map((entry) => [`Alerts to ${entry.to}`, entry.detail]),
            ].map(([term, value]) => (
              <div key={String(term)} className="flex min-h-9 items-center justify-between gap-4 px-4 py-1.5">
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="text-right font-mono text-[12px]">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Versions">
          <dl className="divide-y divide-hairline rounded-card border border-hairline bg-card text-[13px]">
            {[
              ["App", versions.app],
              ["Engine, pinned", versions.enginePinned],
              ["Engine, running", versions.engineRunning ?? "not reachable"],
            ].map(([term, value]) => (
              <div key={term} className="flex min-h-9 items-center justify-between gap-4 px-4 py-1.5">
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="break-all text-right font-mono text-[12px]">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <Panel title="Doctor" description={`${passing} of ${checks.length} checks pass. The same checks as \`livepeer doctor\`.`}>
        <ul className="divide-y divide-hairline rounded-card border border-hairline bg-card">
          {checks.map((check) => (
            <li key={check.name} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-4 text-[13px]">
                <span className="font-medium">{check.name}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[12px] text-muted-foreground">{check.detail}</span>
                  <Status value={check.ok ? "ok" : "failed"} />
                </span>
              </div>
              {!check.ok && check.fix ? <p className="mt-1 text-[12px] text-muted-foreground">Fix: {check.fix}</p> : null}
            </li>
          ))}
        </ul>
      </Panel>

      <OperatorPhonesPanel {...phones} />
      <PhoneActivityPanel entries={phoneActivity} />

      <Panel title="Sources and gaps" description="Every function this console calls, and whether it reads the live engine or a mock. Detail and blockers are in docs/data-sources.md.">
        <Table
          caption="Data sources"
          rows={dataSources}
          rowKey={(row) => `${row.area}:${row.name}`}
          empty="No functions registered."
          columns={[
            { key: "name", header: "Function", cell: (row) => row.name, mono: true },
            { key: "area", header: "Area", cell: (row) => row.area },
            { key: "source", header: "Source", cell: (row) => row.source, mono: true, align: "right" },
          ]}
        />
      </Panel>
    </ConsolePage>
  );
}

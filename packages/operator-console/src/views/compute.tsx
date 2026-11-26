"use client";

import type { ComputeOperator, DataSource } from "@livepeer/api-client";
import { Button } from "@livepeer/ui";
import { useState } from "react";

import { count, host, label } from "../components/format";
import { ConsolePage, Panel, Status } from "../components/parts";
import { Table } from "../components/table";
import { useOperatorCan } from "../shell/role";

export interface ComputeViewProps {
  operators: ComputeOperator[];
  setBlocked: (orchestratorUrl: string, blocked: boolean) => Promise<boolean>;
  sources: ReadonlyArray<{ name: string; source: DataSource }>;
}

export function ComputeView({ operators: initial, setBlocked, sources }: ComputeViewProps) {
  const can = useOperatorCan();
  const [operators, setOperators] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (operator: ComputeOperator) => {
    setBusy(operator.orchestrator_url);
    const blocked = operator.status !== "blocked";
    if (await setBlocked(operator.orchestrator_url, blocked).catch(() => false)) {
      setOperators((current) => current.map((entry) => (entry.orchestrator_url === operator.orchestrator_url ? { ...entry, status: blocked ? "blocked" : "allowed" } : entry)));
    }
    setBusy(null);
  };

  return (
    <ConsolePage title="Compute" description="The network operators that served this instance's recent jobs, and how they performed." sources={sources} note="Performance is derived from the engine's job attempts. Blocking is recorded here but not yet enforced: the engine doesn't accept an allow or block list for routing.">
      <Panel title="Operators that served jobs">
        <Table
          caption="Compute operators"
          rows={operators}
          rowKey={(operator) => operator.orchestrator_url}
          empty="No jobs have been served yet, so there are no operators to show."
          columns={[
            { key: "host", header: "Operator", cell: (operator) => <span className="font-mono text-[12px]">{host(operator.orchestrator_url)}</span> },
            { key: "apps", header: "Served", cell: (operator) => <span className="line-clamp-1 text-muted-foreground">{operator.apps.map(label).join(", ")}</span>, wide: true },
            { key: "jobs", header: "Jobs", cell: (operator) => count(operator.jobs), mono: true, align: "right" },
            { key: "fail", header: "Failed", cell: (operator) => `${operator.jobs ? ((operator.failures / operator.jobs) * 100).toFixed(1) : "0.0"}%`, mono: true, align: "right" },
            { key: "time", header: "Median response", cell: (operator) => (operator.median_response_ms ? `${(operator.median_response_ms / 1000).toFixed(1)} s` : "—"), mono: true, align: "right", wide: true },
            { key: "status", header: "Routing", cell: (operator) => <Status value={operator.status} /> },
            ...(can("block_compute") ? [{ key: "act", header: "", align: "right" as const, cell: (operator: ComputeOperator) => <Button size="sm" variant="ghost" disabled={busy === operator.orchestrator_url} onClick={() => toggle(operator)}>{operator.status === "blocked" ? "Allow" : "Block"}</Button> }] : []),
          ]}
        />
      </Panel>
      <Panel title="Your own GPUs" description="Route jobs only to compute you run, so nobody outside your organisation sees their content.">
        <div className="rounded-card border border-hairline bg-card px-4 py-3 text-[13px] text-muted-foreground">
          Run a Livepeer orchestrator with your runners, then add its address to the engine's discovery list (<span className="font-mono text-[12px]">deploy/config/orchestrators.txt</span>) and remove the others. See the node repository's orchestrator guide.
        </div>
      </Panel>
    </ConsolePage>
  );
}

"use client";

import type { DataSource, EngineJob } from "@livepeer/api-client";
import { Button, Chip } from "@livepeer/ui";
import { ChevronRight, RotateCw } from "lucide-react";
import { Fragment, useState } from "react";

import { dateTime, host, label } from "../components/format";
import { ConsolePage, Status } from "../components/parts";
import { useOperatorCan } from "../shell/role";

export interface JobsViewProps {
  jobs: EngineJob[];
  /** Display names by actor id. */
  names: Record<string, string>;
  retry: (id: string) => Promise<EngineJob | null>;
  sources: ReadonlyArray<{ name: string; source: DataSource }>;
}

const FILTERS = ["all", "running", "failed", "succeeded"] as const;

function duration(job: EngineJob): string {
  if (!job.completed_at) return "—";
  const ms = Date.parse(job.completed_at) - Date.parse(job.created_at);
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function JobsView({ jobs: initial, names, retry, sources }: JobsViewProps) {
  const can = useOperatorCan();
  const [jobs, setJobs] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const shown = filter === "all" ? jobs : jobs.filter((job) => (filter === "failed" ? job.state === "failed" || job.state === "uncertain" : job.state === filter));

  const onRetry = async (id: string) => {
    setRetrying(id);
    const next = await retry(id).catch(() => null);
    if (next) setJobs((current) => current.map((job) => (job.id === id ? next : job)));
    setRetrying(null);
  };

  return (
    <ConsolePage title="Jobs" description="Every job across users, newest first, with the attempts the engine made and why a job failed." sources={sources} note="Live sessions and retry are not served by the engine yet: sessions aren't listed, and Retry is simulated.">
      <div className="mb-3 flex gap-1.5" role="group" aria-label="Filter by status">
        {FILTERS.map((value) => (
          <Chip key={value} selected={filter === value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)}
          </Chip>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="rounded-card border border-dashed border-input px-6 py-12 text-center text-[13px] text-muted-foreground">
          {jobs.length === 0 ? "No jobs yet." : "No jobs with that status."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-hairline bg-card">
          <table className="w-full border-collapse text-[13px] leading-[18px]">
            <caption className="sr-only">Jobs</caption>
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] font-medium uppercase tracking-[0.04em] text-subtle-foreground">
                <th scope="col" className="h-9 w-8 pl-3" />
                <th scope="col" className="h-9 px-3 font-medium">Capability</th>
                <th scope="col" className="hidden h-9 px-3 font-medium md:table-cell">User</th>
                <th scope="col" className="h-9 px-3 font-medium">Status</th>
                <th scope="col" className="hidden h-9 px-3 text-right font-medium md:table-cell">Took</th>
                <th scope="col" className="h-9 px-3 pr-4 text-right font-medium">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {shown.map((job) => {
                const expanded = open === job.id;
                return (
                  <Fragment key={job.id}>
                    <tr className="transition-colors duration-150 hover:bg-hover">
                      <td className="pl-3">
                        <button type="button" aria-expanded={expanded} aria-label={`Details for job ${job.id}`} onClick={() => setOpen(expanded ? null : job.id)} className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-hover hover:text-foreground">
                          <ChevronRight className={`size-3.5 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
                        </button>
                      </td>
                      <td className="h-10 px-3">{label(job.app)}</td>
                      <td className="hidden h-10 px-3 md:table-cell">{(names[job.actor_id] ?? job.actor_id)}</td>
                      <td className="h-10 px-3"><Status value={job.state} /></td>
                      <td className="hidden h-10 px-3 text-right font-mono text-[12px] text-muted-foreground md:table-cell">{duration(job)}</td>
                      <td className="h-10 whitespace-nowrap px-3 pr-4 text-right font-mono text-[12px] text-muted-foreground">{dateTime(job.created_at)}</td>
                    </tr>
                    {expanded ? (
                      <tr className="bg-muted">
                        <td colSpan={6} className="px-4 py-3">
                          <p className="font-mono text-[11px] text-subtle-foreground">{job.id} · {job.app} · {job.mode}</p>
                          {job.failure ? (
                            <p className="mt-2 text-[13px] text-destructive">
                              {job.failure.kind}: {job.failure.message}
                              {job.failure.payment_sent ? " Payment had already been sent." : ""}
                            </p>
                          ) : null}
                          <ol className="mt-2 flex flex-col gap-1">
                            {job.attempts.map((attempt) => (
                              <li key={attempt.number} className="flex flex-wrap items-center gap-x-3 font-mono text-[12px] text-muted-foreground">
                                <span>attempt {attempt.number}</span>
                                <span>{attempt.orchestrator_url ? host(attempt.orchestrator_url) : "no operator"}</span>
                                <span>{attempt.outcome}{attempt.status_code ? ` (${attempt.status_code})` : ""}</span>
                                {attempt.timings?.response_ms ? <span>{attempt.timings.response_ms} ms</span> : null}
                                <span>{attempt.payment_sent ? "paid" : "unpaid"}</span>
                              </li>
                            ))}
                          </ol>
                          {can("retry_job") && (job.state === "failed" || job.state === "uncertain") ? (
                            <Button size="sm" className="mt-3" disabled={retrying === job.id} onClick={() => onRetry(job.id)}>
                              <RotateCw />{retrying === job.id ? "Retrying…" : "Retry"}
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ConsolePage>
  );
}

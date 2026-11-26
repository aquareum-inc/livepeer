"use client";

import type { DataSource, OperatorWorkspace, OperatorWorkspaceDetail, Plan, UsageEntry } from "@livepeer/api-client";
import { Button, Chip, Sheet } from "@livepeer/ui";
import { ArrowLeft } from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";

import { ago, count, dateTime, day, label, usd } from "../components/format";
import { ConsolePage, GapNote, Panel, Stat, Status } from "../components/parts";
import { Table } from "../components/table";
import { useOperatorCan } from "../shell/role";

type LinkType = ComponentType<{ href: string; className?: string; children: ReactNode }>;
type Sources = ReadonlyArray<{ name: string; source: DataSource }>;

const LINK = "whitespace-nowrap font-medium text-foreground underline-offset-2 hover:underline";
const userHref = (id: string) => `/operator/users/${encodeURIComponent(id)}`;

export interface WorkspacesViewProps {
  workspaces: OperatorWorkspace[];
  /** Whether the connected payment provider has shared accounts at all. */
  supported: boolean;
  Link: LinkType;
  sources: Sources;
}

export function WorkspacesView({ workspaces, supported, Link, sources }: WorkspacesViewProps) {
  return (
    <ConsolePage title="Workspaces" description="Shared accounts: several people, each with a role, spending from one budget on one plan." sources={sources}>
      {supported ? (
        <Table
          caption="Workspaces"
          rows={workspaces}
          rowKey={(workspace) => workspace.id}
          empty="No workspaces yet. One appears here when someone creates it from their account menu."
          columns={[
            { key: "name", header: "Workspace", cell: (workspace) => <Link href={`/operator/workspaces/${encodeURIComponent(workspace.id)}`} className={LINK}>{workspace.name}</Link> },
            { key: "owner", header: "Owner", cell: (workspace) => <Link href={userHref(workspace.owner_id)} className="whitespace-nowrap text-muted-foreground underline-offset-2 hover:underline">{workspace.owner_name}</Link>, wide: true },
            { key: "members", header: "Members", cell: (workspace) => count(workspace.member_count), mono: true, align: "right" },
            { key: "status", header: "Status", cell: (workspace) => <Status value={workspace.status} /> },
            { key: "plan", header: "Plan", cell: (workspace) => workspace.plan ?? "—", wide: true },
            { key: "budget", header: "Budget", cell: (workspace) => (workspace.budget === null ? "—" : usd(workspace.budget)), mono: true, align: "right", wide: true },
            { key: "spent", header: "Spent", cell: (workspace) => (workspace.spent === null ? "—" : usd(workspace.spent)), mono: true, align: "right" },
            { key: "left", header: "Remaining", cell: (workspace) => (workspace.remaining === null ? "—" : usd(workspace.remaining)), mono: true, align: "right" },
          ]}
        />
      ) : (
        <GapNote>The connected payment provider has no shared accounts, so every budget here belongs to one person. They're on Users.</GapNote>
      )}
    </ConsolePage>
  );
}

export interface WorkspaceDetailProps {
  workspace: OperatorWorkspaceDetail;
  plans: Plan[];
  plansSupported: boolean;
  usage: UsageEntry[];
  keys: Array<{ id: string; label: string; created: string; revoked: boolean }>;
  Link: LinkType;
  setStatus: (status: "active" | "paused") => Promise<void>;
  assignPlan: (planId: string | null) => Promise<void>;
  topUp: (amountUsd: number) => Promise<void>;
  sources: Sources;
}

const TOP_UPS = [25, 50, 100, 250];

export function WorkspaceDetailView({ workspace, plans, plansSupported, usage, keys, Link, setStatus, assignPlan, topUp, sources }: WorkspaceDetailProps) {
  const can = useOperatorCan();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState(50);
  const paused = workspace.status === "paused";
  const names = new Map(workspace.members.map((member) => [member.user_id, member.name]));
  const keyLabels = new Map(keys.map((key) => [key.id, key.label]));
  /** Who an entry was run by: a member, a key, or someone who has left. */
  const ranBy = (entry: UsageEntry) => (entry.key_id ? `${keyLabels.get(entry.key_id) ?? entry.key_id} (key)` : (names.get(entry.member_id ?? "") ?? "Former member"));

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "That change didn't apply.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <ConsolePage
      title={workspace.name}
      description={`Owned by ${workspace.owner_name} · opened ${day(workspace.created_at)}`}
      sources={sources}
      actions={
        <>
          {can("adjust_account") ? <Button size="sm" onClick={() => setAdding(true)}>Add credit</Button> : null}
          {can("suspend_account") ? (
            <Button size="sm" variant={paused ? "primary" : "outline"} disabled={busy !== null} onClick={() => (paused ? run("status", () => setStatus("active")) : setSuspending(true))}>
              {paused ? "Resume" : "Suspend"}
            </Button>
          ) : null}
        </>
      }
    >
      <Link href="/operator/workspaces" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />Workspaces
      </Link>
      {error ? <p role="alert" className="mb-4 text-[13px] text-destructive">{error}</p> : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Budget" value={workspace.budget === null ? "—" : usd(workspace.budget)} hint="allocation granted" />
        <Stat label="Spent" value={workspace.spent === null ? "—" : usd(workspace.spent)} />
        <Stat label="Remaining" value={workspace.remaining === null ? "—" : usd(workspace.remaining)} tone={workspace.remaining !== null && workspace.remaining <= 0 && workspace.budget !== 0 ? "negative" : undefined} />
        <Stat label="Status" value={<Status value={workspace.status} />} hint={`${workspace.member_count} ${workspace.member_count === 1 ? "member" : "members"}`} />
      </div>

      <Panel title="Members" description="Roles are the workspace's own: its owner handles the plan and credit, admins handle people and keys. Changing them is the owner's to do, not the console's.">
        <Table
          caption="Members"
          rows={workspace.members}
          rowKey={(member) => member.user_id}
          empty="This workspace has no members."
          columns={[
            { key: "name", header: "Member", cell: (member) => <Link href={userHref(member.user_id)} className={LINK}>{member.name}</Link> },
            { key: "email", header: "Email", cell: (member) => <span className="whitespace-nowrap text-muted-foreground">{member.email ?? "—"}</span>, wide: true },
            { key: "role", header: "Role", cell: (member) => <span className="capitalize">{member.role}</span> },
            { key: "credits", header: "Credits used", cell: (member) => count(member.credits), mono: true, align: "right" },
            { key: "jobs", header: "Jobs", cell: (member) => count(member.jobs), mono: true, align: "right", wide: true },
            { key: "active", header: "Last active", cell: (member) => ago(member.last_used_at), mono: true, align: "right", wide: true },
          ]}
        />
        {workspace.other_usage.length > 0 ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            Also charged here:{" "}
            {workspace.other_usage
              .map((row) => `${row.kind === "key" ? `${keyLabels.get(row.id) ?? row.id} (API key)` : "a former member"}, ${count(row.credits)} credits over ${count(row.jobs)} ${row.jobs === 1 ? "job" : "jobs"}`)
              .join("; ")}
            .
          </p>
        ) : null}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Plan" description={plansSupported ? "One plan for the whole workspace. It takes effect on its next billing period." : undefined}>
          {plansSupported ? (
            <div className="flex flex-wrap gap-1.5 rounded-card border border-hairline bg-card p-3">
              <Chip selected={workspace.plan_id === null} aria-pressed={workspace.plan_id === null} disabled={busy !== null || !can("adjust_account")} onClick={() => run("plan", () => assignPlan(null))}>No plan</Chip>
              {plans.map((plan) => (
                <Chip key={plan.id} selected={workspace.plan_id === plan.id} aria-pressed={workspace.plan_id === plan.id} disabled={busy !== null || !can("adjust_account")} onClick={() => run("plan", () => assignPlan(plan.id))}>
                  {plan.name}
                </Chip>
              ))}
            </div>
          ) : (
            <GapNote>The connected provider doesn't support plans. This workspace pays for what it uses from its allocation.</GapNote>
          )}
        </Panel>
        <Panel title="Invitations" description="People invited who haven't answered.">
          <Table
            caption="Invitations"
            rows={workspace.invitations}
            rowKey={(invitation) => invitation.id}
            empty="Nobody is waiting on an invitation."
            columns={[
              { key: "email", header: "Email", cell: (invitation) => invitation.email },
              { key: "role", header: "Role", cell: (invitation) => <span className="capitalize">{invitation.role}</span> },
              { key: "status", header: "Status", cell: (invitation) => <Status value={invitation.status} /> },
              { key: "expires", header: "Expires", cell: (invitation) => day(invitation.expires_at), mono: true, align: "right" },
            ]}
          />
        </Panel>
      </div>

      <Panel title="API keys" description="Keys made for this workspace. They spend its budget.">
        <Table
          caption="API keys"
          rows={keys}
          rowKey={(key) => key.id}
          empty="This workspace has no API keys."
          columns={[
            { key: "label", header: "Key", cell: (key) => key.label || key.id },
            { key: "state", header: "Status", cell: (key) => <Status value={key.revoked ? "revoked" : "active"} /> },
            { key: "created", header: "Created", cell: (key) => dateTime(key.created), mono: true, align: "right" },
          ]}
        />
      </Panel>

      <Panel title="Usage">
        <Table
          caption="Usage"
          rows={usage}
          rowKey={(entry) => entry.id}
          empty="Nothing has been made in this workspace yet."
          columns={[
            { key: "app", header: "Capability", cell: (entry) => label(entry.app) },
            { key: "by", header: "Run by", cell: (entry) => <span className="whitespace-nowrap text-muted-foreground">{ranBy(entry)}</span> },
            { key: "status", header: "Status", cell: (entry) => <Status value={entry.status} />, wide: true },
            { key: "wholesale", header: "Wholesale", cell: (entry) => usd(entry.wholesale.amount, 4), mono: true, align: "right", wide: true },
            { key: "credits", header: "Credits", cell: (entry) => count(entry.credits), mono: true, align: "right" },
            { key: "when", header: "When", cell: (entry) => dateTime(entry.created_at), mono: true, align: "right" },
          ]}
        />
      </Panel>

      <Sheet
        open={suspending}
        onOpenChange={setSuspending}
        title={`Suspend ${workspace.name}?`}
        description="Its allocation is paused: nobody can make anything in it and its API keys stop working, until you resume it. Its members can still sign in and use their own accounts."
      >
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setSuspending(false)}>Cancel</Button>
          <Button variant="destructive" className="flex-1" onClick={() => { setSuspending(false); void run("status", () => setStatus("paused")); }}>Suspend</Button>
        </div>
      </Sheet>

      <Sheet open={adding} onOpenChange={setAdding} title="Add credit" description={`A one-off top-up of ${workspace.name}'s allocation, as a manual adjustment.`}>
        <div className="mb-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Amount">
          {TOP_UPS.map((value) => (
            <Chip key={value} role="radio" aria-checked={amount === value} selected={amount === value} onClick={() => setAmount(value)} className="font-mono">{usd(value, 0)}</Chip>
          ))}
        </div>
        <Button variant="primary" className="w-full" disabled={busy !== null} onClick={() => { setAdding(false); void run("topup", () => topUp(amount)); }}>
          Add {usd(amount, 0)}
        </Button>
      </Sheet>
    </ConsolePage>
  );
}

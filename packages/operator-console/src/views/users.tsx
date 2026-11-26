"use client";

import { OPERATOR_ROLE_COPY, type DataSource, type Plan, type TeamOperator, type UsageEntry } from "@livepeer/api-client";
import { Button, Chip, Sheet } from "@livepeer/ui";
import { ArrowLeft } from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";

import { ago, count, dateTime, day, label, usd } from "../components/format";
import { PlanChangeSheet, type PlanChoice } from "../components/plan-change";
import { ConsolePage, GapNote, Panel, Stat, Status } from "../components/parts";
import { Table } from "../components/table";
import { useOperatorCan } from "../shell/role";
import { joined } from "./team";

type LinkType = ComponentType<{ href: string; className?: string; children: ReactNode }>;

/** One row of the users view: the engine's actor joined with the provider's budget and plan. */
export interface UserRow {
  id: string;
  applicationId: string;
  name: string;
  email: string | null;
  role: "user" | "operator";
  status: string;
  plan: string | null;
  budget: number | null;
  spent: number | null;
  remaining: number | null;
  lastSeen: string | null;
}

export interface UsersViewProps {
  users: UserRow[];
  /** Engine accounts, not revoked, that no one who signs in owns. They're listed by their keys, not here. */
  unlinkedAccounts: number;
  Link: LinkType;
  sources: ReadonlyArray<{ name: string; source: DataSource }>;
}

export function UsersView({ users, unlinkedAccounts, Link, sources }: UsersViewProps) {
  return (
    <ConsolePage title="Users" description="Everyone who signs in to this instance: their budget, what they've spent and their plan." sources={sources}>
      <Table
        caption="Users"
        rows={users}
        rowKey={(user) => user.id}
        empty="No users yet. People appear here when they sign up and are given an allocation."
        columns={[
          { key: "name", header: "User", cell: (user) => <Link href={`/operator/users/${encodeURIComponent(user.id)}`} className="whitespace-nowrap font-medium text-foreground underline-offset-2 hover:underline">{user.name}</Link> },
          { key: "email", header: "Email", cell: (user) => <span className="whitespace-nowrap text-muted-foreground">{user.email ?? "—"}</span>, wide: true },
          { key: "status", header: "Status", cell: (user) => <Status value={user.status} /> },
          { key: "plan", header: "Plan", cell: (user) => user.plan ?? "—", wide: true },
          { key: "budget", header: "Budget", cell: (user) => (user.budget === null ? "—" : usd(user.budget)), mono: true, align: "right", wide: true },
          { key: "spent", header: "Spent", cell: (user) => (user.spent === null ? "—" : usd(user.spent)), mono: true, align: "right" },
          { key: "left", header: "Remaining", cell: (user) => (user.remaining === null ? "—" : usd(user.remaining)), mono: true, align: "right" },
          { key: "seen", header: "Last seen", cell: (user) => ago(user.lastSeen), mono: true, align: "right", wide: true },
        ]}
      />
      {unlinkedAccounts > 0 ? (
        <GapNote className="mt-4">
          {unlinkedAccounts === 1 ? "1 engine account isn't" : `${unlinkedAccounts} engine accounts aren't`} linked to anyone who signs in: made on the engine directly, for a
          service, a test or another app. They're on{" "}
          <Link href="/operator/keys" className="text-foreground underline underline-offset-2">Keys</Link>, by account.
        </GapNote>
      ) : null}
    </ConsolePage>
  );
}

export interface UserDetailProps {
  user: UserRow;
  plans: Plan[];
  plansSupported: boolean;
  usage: UsageEntry[];
  keys: Array<{ id: string; label: string; created: string; revoked: boolean }>;
  /** The workspaces the person belongs to, with their role in each. */
  workspaces: Array<{ id: string; name: string; role: string; status: string }>;
  Link: LinkType;
  setStatus: (status: "active" | "paused") => Promise<void>;
  /** The person's role on the team that runs the instance, or null for the many who aren't on it. */
  team: TeamOperator | null;
  assignPlan: (planId: string | null) => Promise<void>;
  topUp: (amountUsd: number) => Promise<void>;
  sources: ReadonlyArray<{ name: string; source: DataSource }>;
}

const TOP_UPS = [10, 25, 50, 100];

export function UserDetailView({ user, plans, plansSupported, usage, keys, workspaces, Link, setStatus, team, assignPlan, topUp, sources }: UserDetailProps) {
  const can = useOperatorCan();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState(25);
  // A plan changes what someone is billed, so picking one asks before it saves.
  const [choosing, setChoosing] = useState<PlanChoice>(null);
  const paused = user.status === "paused";

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
      title={user.name}
      description={user.email ?? user.id}
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
      <Link href="/operator/users" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />Users
      </Link>
      {error ? <p role="alert" className="mb-4 text-[13px] text-destructive">{error}</p> : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Budget" value={user.budget === null ? "—" : usd(user.budget)} hint="allocation granted" />
        <Stat label="Spent" value={user.spent === null ? "—" : usd(user.spent)} />
        <Stat label="Remaining" value={user.remaining === null ? "—" : usd(user.remaining)} tone={user.remaining !== null && user.remaining <= 0 ? "negative" : undefined} />
        <Stat label="Status" value={<Status value={user.status} />} hint={`last seen ${ago(user.lastSeen)}`} />
      </div>

      <Panel title="Plan" description={plansSupported ? "Assigning a plan takes effect on the user's next billing period." : undefined}>
        {plansSupported ? (
          <div className="flex flex-wrap gap-1.5 rounded-card border border-hairline bg-card p-3">
            <Chip selected={user.plan === null} aria-pressed={user.plan === null} disabled={busy !== null || !can("adjust_account")} onClick={() => user.plan !== null && setChoosing("none")}>No plan</Chip>
            {plans.map((plan) => (
              <Chip key={plan.id} selected={user.plan === plan.name} aria-pressed={user.plan === plan.name} disabled={busy !== null || !can("adjust_account")} onClick={() => user.plan !== plan.name && setChoosing(plan)}>
                {plan.name}
              </Chip>
            ))}
          </div>
        ) : (
          <GapNote>The connected provider doesn't support plans. This user pays for what they use from their allocation.</GapNote>
        )}
      </Panel>

      {workspaces.length > 0 ? (
        <Panel title="Workspaces" description="Shared accounts this person belongs to. Suspending the person stops them in all of them.">
          <Table
            caption="Workspaces"
            rows={workspaces}
            rowKey={(workspace) => workspace.id}
            empty="This person belongs to no workspace."
            columns={[
              { key: "name", header: "Workspace", cell: (workspace) => <Link href={`/operator/workspaces/${encodeURIComponent(workspace.id)}`} className="font-medium text-foreground underline-offset-2 hover:underline">{workspace.name}</Link> },
              { key: "role", header: "Role", cell: (workspace) => <span className="capitalize">{workspace.role}</span> },
              { key: "status", header: "Status", cell: (workspace) => <Status value={workspace.status} /> },
            ]}
          />
        </Panel>
      ) : null}

      {/* A membership like the ones above, and shown only for the few who have it: most people here are not on the team. */}
      {team ? (
        <Panel
          title="Operator team"
          description="This person helps run the instance."
          actions={<Link href="/operator/team" className="shrink-0 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{can("manage_team") ? "Manage on Team" : "See the team"}</Link>}
        >
          <div className="flex flex-col gap-1 rounded-card border border-hairline bg-card px-4 py-3 text-[13px] sm:flex-row sm:items-baseline sm:gap-4">
            <p className="w-[88px] shrink-0 font-medium">{OPERATOR_ROLE_COPY[team.role].name}</p>
            <p className="min-w-0 flex-1 text-muted-foreground">{OPERATOR_ROLE_COPY[team.role].can}</p>
            <p className="shrink-0 text-[12px] text-muted-foreground sm:text-right">{joined(team)}, {day(team.since)}</p>
          </div>
        </Panel>
      ) : null}

      <Panel title="API keys">
        <Table
          caption="API keys"
          rows={keys}
          rowKey={(key) => key.id}
          empty="This user has no API keys."
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
          empty="No usage yet."
          columns={[
            { key: "app", header: "Capability", cell: (entry) => label(entry.app) },
            { key: "status", header: "Status", cell: (entry) => <Status value={entry.status} /> },
            { key: "wholesale", header: "Wholesale", cell: (entry) => usd(entry.wholesale.amount, 4), mono: true, align: "right", wide: true },
            { key: "credits", header: "Credits", cell: (entry) => count(entry.credits), mono: true, align: "right" },
            { key: "when", header: "When", cell: (entry) => dateTime(entry.created_at), mono: true, align: "right" },
          ]}
        />
      </Panel>

      <Sheet open={suspending} onOpenChange={setSuspending} title={`Suspend ${user.name}?`} description="Their allocation is paused: they can sign in but can't run anything until you resume them.">
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setSuspending(false)}>Cancel</Button>
          <Button variant="destructive" className="flex-1" onClick={() => { setSuspending(false); void run("status", () => setStatus("paused")); }}>Suspend</Button>
        </div>
      </Sheet>

      <PlanChangeSheet choice={choosing} name={user.name} kind="person" current={user.plan} busy={busy !== null} onClose={() => setChoosing(null)} onConfirm={(planId) => { setChoosing(null); void run("plan", () => assignPlan(planId)); }} />

      <Sheet open={adding} onOpenChange={setAdding} title="Add credit" description={`A one-off top-up of ${user.name}'s allocation, as a manual adjustment.`}>
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

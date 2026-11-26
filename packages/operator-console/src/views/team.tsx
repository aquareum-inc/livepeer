"use client";

import { OPERATOR_ROLES, OPERATOR_ROLE_COPY, type NewOperatorInvitation, type OperatorInvitation, type OperatorRole, type OperatorTeam, type TeamOperator } from "@livepeer/api-client";
import { Badge, Button, Segmented, Sheet } from "@livepeer/ui";
import { Check, Copy, UserPlus } from "lucide-react";
import { useState } from "react";

import { dateTime, day } from "../components/format";
import { ConsolePage, Panel } from "../components/parts";
import { Table } from "../components/table";

type Changed = { ok: true; team: OperatorTeam } | { ok: false; error: string };

export interface TeamViewProps {
  team: OperatorTeam;
  /** The signed-in operator's id. */
  me: string;
  /** The instance's public address, which an invitation's link starts with. Blank to use the address the console is open at. */
  origin: string;
  invite: (role: OperatorRole) => Promise<{ ok: true; invitation: NewOperatorInvitation; team: OperatorTeam } | { ok: false; error: string }>;
  revokeInvitation: (id: string) => Promise<Changed>;
  setRole: (userId: string, role: OperatorRole) => Promise<Changed>;
  /** Taking yourself off answers with `left`: there is no team to show someone who is no longer on it. */
  remove: (userId: string) => Promise<Changed | { ok: true; left: true }>;
  /** Where someone who has just left goes. */
  onLeft: () => void;
}

const ROLE_OPTIONS = OPERATOR_ROLES.map((role) => ({ value: role, label: OPERATOR_ROLE_COPY[role].name }));

/** How someone came to be on the team, in a few words. */
export function joined(operator: Pick<TeamOperator, "via" | "added_by">): string {
  if (operator.via === "provider") return "From your identity provider";
  if (operator.via === "setup") return "First owner, from setup";
  const by = operator.added_by ?? "a former owner";
  return operator.via === "invitation" ? `Invited by ${by}` : `Added by ${by}`;
}

function RolePicker({ value, onChange }: { value: OperatorRole; onChange: (role: OperatorRole) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-caption font-medium text-foreground">Role</span>
      <Segmented label="Role" options={ROLE_OPTIONS} value={value} onValueChange={onChange} />
      <p className="mt-2 text-caption text-muted-foreground">{OPERATOR_ROLE_COPY[value].can}</p>
    </div>
  );
}

/** The people who run this instance. Owners invite, change roles and remove; everyone else sees who is here and can leave. */
export function TeamView({ team: initial, me, origin, invite, revokeInvitation, setRole, remove, onLeft }: TeamViewProps) {
  const [team, setTeam] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState<{ role: OperatorRole; made: NewOperatorInvitation | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [managing, setManaging] = useState<{ operator: TeamOperator; role: OperatorRole; step: "role" | "remove" } | null>(null);
  const [revoking, setRevoking] = useState<OperatorInvitation | null>(null);
  const owner = team.role === "owner";
  // Only read once a link exists, which is after a click, so the address is the browser's own.
  const link = inviting?.made ? `${origin || window.location.origin}${inviting.made.path}` : "";

  /** Runs a change and shows the team it answers with, or why nothing changed. */
  const run = async (change: () => Promise<Changed | { ok: true; left: true }>, done: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const result = await change();
      if (!result.ok) return setError(result.error);
      if ("left" in result) return onLeft();
      setTeam(result.team);
      done();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "That change didn't apply.");
    } finally {
      setBusy(false);
    }
  };

  const createInvitation = async () => {
    if (!inviting) return;
    setBusy(true);
    setError(null);
    try {
      const result = await invite(inviting.role);
      if (!result.ok) return setError(result.error);
      setTeam(result.team);
      setInviting({ role: inviting.role, made: result.invitation });
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "The invitation wasn't made.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeInvite = () => {
    setInviting(null);
    setCopied(false);
    setError(null);
  };
  const closeManage = () => {
    setManaging(null);
    setError(null);
  };
  const managed = managing?.operator ?? null;
  const leaving = managed?.user_id === me;

  return (
    <ConsolePage
      title="Team"
      description="The people who run this instance, and what each may do."
      actions={owner ? <Button size="sm" variant="primary" onClick={() => setInviting({ role: "member", made: null })}><UserPlus />Invite</Button> : null}
    >
      <Panel title={`Operators (${team.operators.length})`}>
        <Table
          caption="Operators"
          rows={team.operators}
          rowKey={(operator) => operator.user_id}
          empty="Nobody is on the team."
          columns={[
            {
              key: "name",
              header: "Person",
              cell: (operator) => (
                <span className="flex items-center gap-2 whitespace-nowrap font-medium">
                  {operator.name}
                  {operator.user_id === me ? <Badge>You</Badge> : null}
                </span>
              ),
            },
            { key: "email", header: "Email", cell: (operator) => <span className="text-muted-foreground">{operator.email ?? "—"}</span>, wide: true },
            { key: "role", header: "Role", cell: (operator) => OPERATOR_ROLE_COPY[operator.role].name },
            { key: "joined", header: "Joined", cell: (operator) => <span className="text-muted-foreground">{joined(operator)}</span>, wide: true },
            { key: "since", header: "Since", cell: (operator) => day(operator.since), mono: true, align: "right", wide: true },
            {
              key: "act",
              header: "",
              align: "right",
              cell: (operator) =>
                // The identity provider decides for its own operators, so the console offers nothing for them.
                operator.via === "provider" ? null : owner && operator.user_id !== me ? (
                  <Button size="sm" variant="ghost" onClick={() => setManaging({ operator, role: operator.role, step: "role" })}>Manage</Button>
                ) : operator.user_id === me ? (
                  <Button size="sm" variant="ghost" onClick={() => setManaging({ operator, role: operator.role, step: "remove" })}>Leave</Button>
                ) : null,
            },
          ]}
        />
      </Panel>

      {owner ? (
        <Panel title="Invitations waiting" description="Each link works once and lasts 72 hours. A link is shown when it's made and not again, so revoke one and make another if it goes astray.">
          <Table
            caption="Invitations waiting"
            rows={team.invitations}
            rowKey={(invitation) => invitation.id}
            empty="No invitations waiting."
            columns={[
              { key: "role", header: "Role", cell: (invitation) => OPERATOR_ROLE_COPY[invitation.role].name },
              { key: "by", header: "Invited by", cell: (invitation) => invitation.invited_by ?? "A former owner" },
              { key: "made", header: "Made", cell: (invitation) => dateTime(invitation.created_at), mono: true, align: "right", wide: true },
              { key: "expires", header: "Expires", cell: (invitation) => dateTime(invitation.expires_at), mono: true, align: "right" },
              { key: "act", header: "", align: "right", cell: (invitation) => <Button size="sm" variant="ghost" onClick={() => setRevoking(invitation)}>Revoke</Button> },
            ]}
          />
        </Panel>
      ) : null}

      <Panel title="What each role can do">
        <dl className="divide-y divide-hairline rounded-card border border-hairline bg-card text-[13px]">
          {OPERATOR_ROLES.map((role) => (
            <div key={role} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-4">
              <dt className="w-[88px] shrink-0 font-medium">{OPERATOR_ROLE_COPY[role].name}</dt>
              <dd className="text-muted-foreground">{OPERATOR_ROLE_COPY[role].can}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Sheet
        open={inviting !== null}
        onOpenChange={(open) => !open && closeInvite()}
        title={inviting?.made ? "Copy the link now" : "Invite someone to the team"}
        description={inviting?.made ? "It's shown once. Send it to the person you're inviting." : "You'll get a link to send them. They sign in, or make an account, and join."}
      >
        {inviting?.made ? (
          <div className="flex flex-col gap-3">
            <p className="break-all rounded-field bg-muted px-3 py-2.5 font-mono text-[12px]">{link}</p>
            <p className="text-caption text-muted-foreground">
              Anyone with it can join as {inviting.made.role === "owner" ? "an owner" : `a ${inviting.made.role}`} until it's used or expires on {dateTime(inviting.made.expires_at)}.
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy link"}</Button>
              <Button variant="primary" className="flex-1" onClick={closeInvite}>Done</Button>
            </div>
          </div>
        ) : inviting ? (
          <div className="flex flex-col gap-4">
            <RolePicker value={inviting.role} onChange={(role) => setInviting({ role, made: null })} />
            {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
            <Button variant="primary" disabled={busy} onClick={() => void createInvitation()}>{busy ? "Making the link…" : "Make the link"}</Button>
          </div>
        ) : null}
      </Sheet>

      <Sheet
        open={managing !== null}
        onOpenChange={(open) => !open && closeManage()}
        title={managing?.step === "remove" ? (leaving ? "Leave the team?" : `Remove ${managed?.name ?? ""}?`) : (managed?.name ?? "")}
        description={
          managing?.step === "remove"
            ? leaving
              ? "You lose the console straight away, here and on your phone. Your account stays as it is."
              : "They lose the console straight away, on the web and on their phone. Their account stays as it is."
            : undefined
        }
      >
        {managing?.step === "remove" && managed ? (
          <div className="flex flex-col gap-3">
            {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={closeManage}>{leaving ? "Stay" : "Keep them"}</Button>
              <Button variant="destructive" className="flex-1" disabled={busy} onClick={() => void run(() => remove(managed.user_id), closeManage)}>
                {leaving ? (busy ? "Leaving…" : "Leave") : busy ? "Removing…" : "Remove"}
              </Button>
            </div>
          </div>
        ) : managing && managed ? (
          <div className="flex flex-col gap-4">
            <RolePicker value={managing.role} onChange={(role) => setManaging({ ...managing, role })} />
            {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
            <Button variant="primary" disabled={busy || managing.role === managed.role} onClick={() => void run(() => setRole(managed.user_id, managing.role), closeManage)}>
              {busy ? "Saving…" : "Save role"}
            </Button>
            <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => setManaging({ ...managing, step: "remove" })}>Remove from the team…</Button>
          </div>
        ) : null}
      </Sheet>

      <Sheet open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)} title="Revoke this invitation?" description="Its link stops working. Anyone you sent it to will need a new one.">
        <div className="flex flex-col gap-3">
          {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setRevoking(null)}>Keep it</Button>
            <Button variant="destructive" className="flex-1" disabled={busy} onClick={() => revoking && void run(() => revokeInvitation(revoking.id), () => setRevoking(null))}>Revoke</Button>
          </div>
        </div>
      </Sheet>
    </ConsolePage>
  );
}

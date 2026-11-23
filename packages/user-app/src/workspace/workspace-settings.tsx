"use client";

import type { WorkspaceDetail, WorkspaceMemberRow } from "@livepeer/api-client";
import type { WorkspaceInvitation, WorkspaceRole } from "@livepeer/api-client/provider";
import { ASSIGNABLE_ROLES, can, canChangeRole, canLeave, canRemoveMember } from "@livepeer/api-client/workspaces";
import { Badge, Button, Card, Field, Input, Row, Section, Segmented, Sheet } from "@livepeer/ui";
import { Check, Copy, UserPlus } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { PersonMark, ROLE_LABEL, ROLE_SUMMARY, WorkspaceMark, count, type Outcome } from "./shared";

type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export interface WorkspaceSettingsProps {
  detail: WorkspaceDetail;
  rename: (name: string) => Promise<Outcome<string>>;
  invite: (input: { email: string; role: AssignableRole }) => Promise<Outcome<WorkspaceInvitation>>;
  revokeInvitation: (invitationId: string) => Promise<Outcome<boolean>>;
  setRole: (userId: string, role: AssignableRole) => Promise<Outcome<WorkspaceRole>>;
  remove: (userId: string) => Promise<Outcome<boolean>>;
  transfer: (userId: string) => Promise<Outcome<string>>;
  leave: () => Promise<Outcome>;
}

const ROLE_OPTIONS = ASSIGNABLE_ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }));
const day = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));

function expiry(invitation: WorkspaceInvitation): string {
  const days = Math.ceil((Date.parse(invitation.expires_at) - Date.now()) / 86_400_000);
  return days <= 1 ? "expires today" : `expires in ${days} days`;
}

/** Copies an invitation's link, and says so for a moment. */
function CopyLink({ token, variant = "ghost" }: { token: string; variant?: "ghost" | "secondary" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/join/${token}`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

/**
 * The workspace the person is working in: its name, who belongs and what each has used, the invitations
 * waiting, and the way out. What each control does is decided by the reader's role (`can`).
 */
export function WorkspaceSettings({ detail, rename, invite, revokeInvitation, setRole, remove, transfer, leave }: WorkspaceSettingsProps) {
  const { workspace, role, members, invitations, viewer_id } = detail;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"rename" | "invite" | "leave" | null>(null);
  const [name, setName] = useState(workspace.name);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AssignableRole>("member");
  const [invited, setInvited] = useState<WorkspaceInvitation | null>(null);
  const [managing, setManaging] = useState<{ userId: string; step: "manage" | "remove" | "transfer" } | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const managed = managing ? members.find((member) => member.user_id === managing.userId) ?? null : null;
  const owner = members.find((member) => member.role === "owner");

  /** Runs an action; closes what's open when it works, shows why when it doesn't. */
  const run = <T,>(action: () => Promise<Outcome<T>>, done?: (data: T) => void) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result) return;
      if (result.ok) done?.(result.data);
      else setError(result.error);
    });
  };
  const close = () => {
    setSheet(null);
    setManaging(null);
    setInvited(null);
    setError(null);
    setConfirmName("");
  };

  const submitInvite = (event: FormEvent) => {
    event.preventDefault();
    run(() => invite({ email, role: inviteRole }), (invitation) => {
      setInvited(invitation);
      setEmail("");
    });
  };
  const submitRename = (event: FormEvent) => {
    event.preventDefault();
    run(() => rename(name), close);
  };

  const usage = (member: WorkspaceMemberRow) => (member.credits === null ? null : member.jobs ? `${count(member.credits)} credits · ${count(member.jobs)} ${member.jobs === 1 ? "job" : "jobs"}` : "Nothing used yet");
  const manageable = (member: WorkspaceMemberRow) => member.user_id !== viewer_id && (canChangeRole(role, member.role) || canRemoveMember(role, member.role));

  return (
    <>
      <Card className="mb-8 flex flex-wrap items-center gap-4 p-5">
        <WorkspaceMark name={workspace.name} className="size-12 rounded-[13px] text-lead" />
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-lead font-semibold">
            <span className="truncate">{workspace.name}</span>
            {workspace.status === "paused" ? <Badge tone="warn">Suspended</Badge> : null}
          </h2>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {workspace.member_count} {workspace.member_count === 1 ? "member" : "members"} · You're {role === "member" ? "a member" : role === "admin" ? "an admin" : "the owner"}
          </p>
        </div>
        {can(role, "rename") ? <Button onClick={() => { setName(workspace.name); setSheet("rename"); }}>Rename</Button> : null}
      </Card>

      {workspace.status === "paused" ? (
        <p role="status" className="mb-8 rounded-card border border-hairline bg-muted px-4 py-3 text-caption text-muted-foreground">
          This workspace is suspended by the service's operator, so nothing can be made in it for now. Your personal account still works.
        </p>
      ) : null}

      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-body font-semibold">Members</h2>
            <p className="mt-1 max-w-[52ch] text-caption text-muted-foreground">
              Everyone here makes things with the workspace's credit and shares its library.{" "}
              {can(role, "view_all_usage") ? "Usage is since the workspace opened." : "You see your own usage; owners and admins see everyone's."}
            </p>
          </div>
          {can(role, "manage_members") ? <Button variant="primary" className="shrink-0" onClick={() => setSheet("invite")}><UserPlus />Invite</Button> : null}
        </div>
        <Card className="divide-y divide-hairline">
          {members.map((member) => (
            <div key={member.user_id} className="flex items-center gap-3 px-4 py-3">
              <PersonMark name={member.name} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-body font-medium">
                  <span className="truncate">{member.name}</span>
                  {member.user_id === viewer_id ? <span className="shrink-0 text-caption font-normal text-subtle-foreground">You</span> : null}
                </p>
                <p className="mt-0.5 truncate text-caption text-muted-foreground">
                  {member.email ?? "No email"}
                  {usage(member) ? <span className="font-mono text-[11px] text-subtle-foreground"> · {usage(member)}</span> : null}
                </p>
              </div>
              <Badge tone={member.role === "owner" ? "live" : "neutral"} className="shrink-0">{ROLE_LABEL[member.role]}</Badge>
              {manageable(member) ? (
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setManaging({ userId: member.user_id, step: "manage" })}>Manage</Button>
              ) : null}
            </div>
          ))}
        </Card>
      </section>

      {can(role, "manage_members") ? (
        <section className="mb-8">
          <h2 className="mb-1 text-body font-semibold">Invitations</h2>
          <p className="mb-3 max-w-[64ch] text-caption text-muted-foreground">People who have been invited and haven't answered. An invitation lasts 7 days.</p>
          {invitations.length === 0 ? (
            <Card className="px-4 py-4 text-body text-muted-foreground">Nobody is waiting on an invitation.</Card>
          ) : (
            <Card className="divide-y divide-hairline">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <div className="min-w-[180px] flex-1">
                    <p className="flex items-center gap-2 text-body font-medium">
                      <span className="truncate">{invitation.email}</span>
                      {invitation.status === "expired" ? <Badge tone="warn">Expired</Badge> : null}
                    </p>
                    <p className="mt-0.5 text-caption text-muted-foreground">
                      {ROLE_LABEL[invitation.role]} · invited by {invitation.invited_by_name} on {day(invitation.created_at)}
                      {invitation.status === "pending" ? ` · ${expiry(invitation)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {invitation.status === "pending" ? <CopyLink token={invitation.token} /> : null}
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => invite({ email: invitation.email, role: invitation.role }))}>Resend</Button>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => revokeInvitation(invitation.id))}>Cancel</Button>
                  </div>
                </div>
              ))}
            </Card>
          )}
          {error && !sheet && !managing ? <p role="alert" className="mt-3 text-caption text-destructive">{error}</p> : null}
        </section>
      ) : null}

      <Section title="Leaving">
        {canLeave(role) ? (
          <Row label="Leave this workspace" hint="What you made stays in its library. Your chats here go with you.">
            <Button onClick={() => setSheet("leave")}>Leave</Button>
          </Row>
        ) : (
          <Row
            label="You own this workspace"
            hint={members.length > 1 ? "To leave, make another member the owner first: choose Manage beside their name." : "To hand it on, invite someone and make them the owner."}
          />
        )}
      </Section>

      <Sheet open={sheet === "rename"} onOpenChange={(open) => !open && close()} title="Rename workspace" description="Everyone in the workspace sees the new name.">
        <form onSubmit={submitRename} className="flex flex-col gap-4">
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={48} autoFocus required />
          </Field>
          {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
          <Button type="submit" variant="primary" disabled={pending || name.trim().length < 2}>{pending ? "Saving…" : "Save name"}</Button>
        </form>
      </Sheet>

      <Sheet
        open={sheet === "invite"}
        onOpenChange={(open) => !open && close()}
        title={invited ? "Invitation sent" : `Invite to ${workspace.name}`}
        description={invited ? `${invited.email} has 7 days to join as ${invited.role === "admin" ? "an admin" : "a member"}. You can also send them the link yourself.` : "They get an email with a link to join. They'll need an account here, or can make one."}
      >
        {invited ? (
          <div className="flex flex-col gap-3">
            <CopyLink token={invited.token} variant="secondary" />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setInvited(null)}>Invite another</Button>
              <Button variant="primary" className="flex-1" onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submitInvite} className="flex flex-col gap-4">
            <Field label="Email">
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" autoComplete="off" autoFocus required />
            </Field>
            <div>
              <span className="mb-1.5 block text-caption font-medium text-foreground">Role</span>
              <Segmented label="Role" options={ROLE_OPTIONS} value={inviteRole} onValueChange={setInviteRole} />
              <p className="mt-2 text-caption text-muted-foreground">{ROLE_SUMMARY[inviteRole]}</p>
            </div>
            {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
            <Button type="submit" variant="primary" disabled={pending || email.trim() === ""}>{pending ? "Inviting…" : "Send invitation"}</Button>
          </form>
        )}
      </Sheet>

      <Sheet
        open={managed !== null}
        onOpenChange={(open) => !open && close()}
        title={managing?.step === "remove" ? `Remove ${managed?.name ?? ""}?` : managing?.step === "transfer" ? `Make ${managed?.name ?? ""} the owner?` : (managed?.name ?? "")}
        description={
          managing?.step === "remove"
            ? "They lose access straight away. What they made stays in the library, and any API keys they made keep working until someone revokes them."
            : managing?.step === "transfer"
              ? `They take over the plan and credit of ${workspace.name}, and you become an admin. Only they can hand it back.`
              : (managed?.email ?? undefined)
        }
      >
        {managed && managing?.step === "manage" ? (
          <div className="flex flex-col gap-5">
            {canChangeRole(role, managed.role) ? (
              <div>
                <span className="mb-1.5 block text-caption font-medium text-foreground">Role</span>
                <Segmented
                  label="Role"
                  options={ROLE_OPTIONS}
                  value={managed.role === "admin" ? "admin" : "member"}
                  onValueChange={(next) => next !== managed.role && run(() => setRole(managed.user_id, next))}
                />
                <p className="mt-2 text-caption text-muted-foreground">{ROLE_SUMMARY[managed.role]}</p>
              </div>
            ) : null}
            {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
            <div className="flex flex-col gap-2">
              {can(role, "transfer_ownership") ? <Button disabled={pending} onClick={() => setManaging({ userId: managed.user_id, step: "transfer" })}>Make owner…</Button> : null}
              {canRemoveMember(role, managed.role) ? (
                <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => setManaging({ userId: managed.user_id, step: "remove" })}>Remove from workspace…</Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {managed && managing?.step === "remove" ? (
          <div className="flex flex-col gap-3">
            {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={close}>Keep them</Button>
              <Button variant="destructive" className="flex-1" disabled={pending} onClick={() => run(() => remove(managed.user_id), close)}>{pending ? "Removing…" : "Remove"}</Button>
            </div>
          </div>
        ) : null}
        {managed && managing?.step === "transfer" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => transfer(managed.user_id), close);
            }}
          >
            <Field label={`Type “${workspace.name}” to confirm`}>
              <Input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" autoFocus />
            </Field>
            {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={close}>Cancel</Button>
              <Button type="submit" variant="primary" className="flex-1" disabled={pending || confirmName.trim() !== workspace.name}>{pending ? "Transferring…" : "Transfer workspace"}</Button>
            </div>
          </form>
        ) : null}
      </Sheet>

      <Sheet
        open={sheet === "leave"}
        onOpenChange={(open) => !open && close()}
        title={`Leave ${workspace.name}?`}
        description={`You'll go back to your personal account. What you made here stays with the workspace, and to return you'd need a new invitation${owner ? ` from ${owner.name} or an admin` : ""}.`}
      >
        <div className="flex flex-col gap-3">
          {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={close}>Stay</Button>
            <Button variant="destructive" className="flex-1" disabled={pending} onClick={() => run(leave)}>{pending ? "Leaving…" : "Leave workspace"}</Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

"use client";

import type { Accounts } from "@livepeer/api-client";
import { can } from "@livepeer/api-client/workspaces";
import { Button, Field, Input, Popover, PopoverClose, PopoverContent, PopoverTrigger, RollingNumber, Sheet, cn, useTheme } from "@livepeer/ui";
import { Check, Coins, LogIn, LogOut, Mail, Moon, Plus, Settings2, ShieldCheck, Sparkles, Sun, UserRound, Users, Wrench, type LucideIcon } from "lucide-react";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";

import { ROLE_LABEL, WorkspaceMark, count, type Outcome } from "../workspace/shared";
import { useCredits } from "./credits";
import { useLink } from "./link";

export interface Account {
  name: string;
  email: string | null;
  role: "user" | "operator";
}

/** The accounts the person can work in, and how to move between them. Null where the provider has no workspaces. */
export interface AccountSwitching {
  accounts: Accounts;
  switchAccount: (accountId: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<Outcome>;
}

export interface AccountMenuProps {
  /** The signed-in person, or null for a guest. */
  account: Account | null;
  switching: AccountSwitching | null;
  /** Shows the name and balance beside the avatar (the open sidebar). */
  expanded?: boolean;
  /** Where the sign-out form posts. */
  signOutAction: string;
  signInHref: string;
  /** Whether this instance serves the operator console. */
  consoleAvailable: boolean;
  side?: "top" | "bottom";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

function Avatar({ account, className }: { account: Account | null; className?: string }) {
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[12px] font-semibold text-secondary-foreground ring-1 ring-hairline", className)}>
      {account ? initials(account.name) : <UserRound className="size-[55%]" strokeWidth={1.75} aria-hidden />}
    </span>
  );
}

const ITEM = "flex h-10 w-full items-center gap-3 rounded-field px-3 text-left text-body text-foreground transition-colors duration-150 hover:bg-hover";

function Item({ href, icon: Icon, tall = false, children }: { href: string; icon: LucideIcon; tall?: boolean; children: ReactNode }) {
  const Link = useLink();
  return (
    <PopoverClose asChild>
      <Link href={href} className={cn(ITEM, tall && "h-12")}>
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
        {children}
      </Link>
    </PopoverClose>
  );
}

/**
 * The account, at the foot of the sidebar: who you are, your credits, and the way to plans,
 * settings and sign-out. A guest gets the same place, with a way to sign in.
 */
export function AccountMenu({ account, switching, expanded = false, signOutAction, signInHref, consoleAvailable, side = "top" }: AccountMenuProps) {
  const { credits } = useCredits();
  const { resolved, setPreference } = useTheme();
  const name = account?.name ?? "Guest";
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = switching?.accounts.accounts.find((entry) => entry.id === switching.accounts.current) ?? null;
  const workspace = current?.kind === "workspace" ? current : null;

  const switchTo = (accountId: string) => {
    if (!switching || accountId === switching.accounts.current) return setOpen(false);
    setSwitchingTo(accountId);
    startTransition(async () => {
      await switching.switchAccount(accountId);
      setSwitchingTo(null);
      setOpen(false);
    });
  };

  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!switching) return;
    setError(null);
    startTransition(async () => {
      // On success the action moves to the new workspace's settings, so only a refusal comes back.
      const result = await switching.createWorkspace(workspaceName);
      if (result && !result.ok) setError(result.error);
      else setCreating(false);
    });
  };

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Account: ${name}`}
          className={cn(
            "flex items-center gap-2.5 rounded-full text-left transition-[background-color,transform] duration-200 ease-out-expo hover:bg-hover active:scale-[0.98] data-[state=open]:bg-hover",
            expanded ? "w-full p-1.5 pr-3" : "p-1",
          )}
        >
          <Avatar account={account} />
          {expanded ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium text-foreground">{name}</span>
              <span className="flex items-center gap-1 font-mono text-[11px] text-subtle-foreground">
                {account ? (
                  <>
                    {workspace ? <span className="min-w-0 truncate font-sans text-[12px]">{workspace.name} ·</span> : null}
                    <Coins className="size-3 shrink-0" aria-hidden />
                    <RollingNumber value={credits} />
                  </>
                ) : (
                  "Not signed in"
                )}
              </span>
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} align="start" className="w-[280px]">
        <div className="flex items-center gap-3 px-3 pb-2 pt-2.5">
          <Avatar account={account} className="size-10 text-body" />
          <div className="min-w-0">
            <p className="truncate text-body font-semibold">{name}</p>
            <p className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              {account ? (
                switching ? (
                  <span className="truncate font-sans text-caption">{account.email ?? "Signed in"}</span>
                ) : (
                  <>
                    <Coins className="size-3" aria-hidden />
                    <RollingNumber value={credits} /> credits
                  </>
                )
              ) : (
                "Sign in to generate and save your work"
              )}
            </p>
          </div>
        </div>

        {account && switching ? (
          <>
            <div className="my-1 h-px bg-hairline" />
            <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium text-subtle-foreground">Working in</p>
            <ul aria-label="Accounts">
              {switching.accounts.accounts.map((entry) => {
                const selected = entry.id === switching.accounts.current;
                return (
                  <li key={entry.id}>
                    <button type="button" aria-current={selected ? "true" : undefined} disabled={pending} onClick={() => switchTo(entry.id)} className={cn(ITEM, "h-12", switchingTo === entry.id && "opacity-60")}>
                      {entry.kind === "workspace" ? <WorkspaceMark name={entry.name} className="size-7 text-[11px]" /> : <Avatar account={account} className="size-7 text-[10px]" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{entry.kind === "workspace" ? entry.name : "Personal"}</span>
                        <span className="block truncate text-[11px] text-subtle-foreground">
                          {entry.kind === "workspace" ? `${ROLE_LABEL[entry.role]}${entry.status === "paused" ? " · Suspended" : ""}` : "Only you"}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{count(selected ? credits : entry.credits)}</span>
                      <Check className={cn("size-4 shrink-0 text-foreground", selected ? "opacity-100" : "opacity-0")} strokeWidth={2} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
            {switching.accounts.invitations.map((invitation) => (
              <Item key={invitation.id} href={`/join/${invitation.token}`} icon={Mail} tall>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">Join {invitation.workspace_name}</span>
                  <span className="block truncate text-[11px] text-subtle-foreground">Invited by {invitation.invited_by_name}</span>
                </span>
              </Item>
            ))}
            <button
              type="button"
              className={ITEM}
              onClick={() => {
                setOpen(false);
                setError(null);
                setWorkspaceName("");
                setCreating(true);
              }}
            >
              <Plus className="size-4 text-muted-foreground" strokeWidth={1.75} />
              Create workspace
            </button>
          </>
        ) : null}

        {account ? (
          <>
            <div className="my-1 h-px bg-hairline" />
            {!current || can(current.role, "manage_billing") ? <Item href="/settings/plan" icon={Coins}>Add credits</Item> : null}
            <Item href="/settings/plan" icon={Sparkles}>Plan</Item>
            {workspace ? <Item href="/settings/workspace" icon={Users}>Members</Item> : null}
            <div className="my-1 h-px bg-hairline" />
            <Item href="/settings" icon={Settings2}>Settings</Item>
            <Item href="/settings/privacy" icon={ShieldCheck}>Who can see what</Item>
            {account.role === "operator" && consoleAvailable ? <Item href="/operator" icon={Wrench}>Operator console</Item> : null}
          </>
        ) : null}

        <div className="my-1 h-px bg-hairline" />
        <button type="button" className={ITEM} onClick={() => setPreference(resolved === "dark" ? "light" : "dark")}>
          {resolved === "dark" ? <Sun className="size-4 text-muted-foreground" strokeWidth={1.75} /> : <Moon className="size-4 text-muted-foreground" strokeWidth={1.75} />}
          {resolved === "dark" ? "Light theme" : "Dark theme"}
        </button>
        <div className="my-1 h-px bg-hairline" />
        {account ? (
          <form action={signOutAction} method="post">
            <button type="submit" className={ITEM}>
              <LogOut className="size-4 text-muted-foreground" strokeWidth={1.75} />
              Sign out
            </button>
          </form>
        ) : (
          <a href={signInHref} className={ITEM}>
            <LogIn className="size-4 text-muted-foreground" strokeWidth={1.75} />
            Sign in or sign up
          </a>
        )}
      </PopoverContent>
    </Popover>

    <Sheet
      open={creating}
      onOpenChange={setCreating}
      title="Create a workspace"
      description="A shared account for a team: one credit balance, one library, and a role for each person. Your personal account stays as it is."
    >
      <form onSubmit={create} className="flex flex-col gap-4">
        <Field label="Name" hint="Usually your team's or company's name. You can change it later.">
          <Input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Northlight Studio" minLength={2} maxLength={48} autoFocus required />
        </Field>
        {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
        <Button type="submit" variant="primary" disabled={pending || workspaceName.trim().length < 2}>{pending ? "Creating…" : "Create workspace"}</Button>
      </form>
    </Sheet>
    </>
  );
}

"use client";

import type { Accounts } from "@livepeer/api-client";
import { can } from "@livepeer/api-client/workspaces";
import { Button, Field, Input, Popover, PopoverClose, PopoverContent, PopoverTrigger, RollingNumber, Sheet, cn, useTheme } from "@livepeer/ui";
import { Check, Coins, LogIn, LogOut, Moon, Plus, Settings2, ShieldCheck, Sun, UserRound, Users, Wrench, type LucideIcon } from "lucide-react";
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

/**
 * Every row in the menu has the same shape: a 28px slot on the left, then the words. An account's mark fills
 * the slot and an icon sits in the middle of it, so marks, icons and labels each keep to one column.
 */
const ROW = "flex h-9 w-full items-center gap-2.5 rounded-field px-2 text-left text-body text-foreground transition-colors duration-150 hover:bg-hover";
const SLOT = "size-7 text-[11px]";

function Lead({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  );
}

function Item({ href, icon, children }: { href: string; icon: LucideIcon; children: ReactNode }) {
  const Link = useLink();
  return (
    <PopoverClose asChild>
      <Link href={href} className={ROW}>
        <Lead icon={icon} />
        {children}
      </Link>
    </PopoverClose>
  );
}

const RULE = <div className="my-1 h-px bg-hairline" />;

/**
 * The account, at the foot of the sidebar: who you are, your credits, and the way to plans,
 * settings and sign-out. A guest gets the same place, with a way to sign in.
 */
export function AccountMenu({ account, switching, expanded = false, signOutAction, signInHref, consoleAvailable, side = "top" }: AccountMenuProps) {
  const { credits } = useCredits();
  const { resolved, setPreference } = useTheme();
  const name = account?.name ?? "Guest";
  const Link = useLink();
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
      <PopoverContent side={side} align="start" className="w-[272px]">
        {account && switching ? (
          <>
            {/* The accounts are the top of the menu: the person's own first, so it also says who is signed in. */}
            <ul aria-label="Working in">
              {switching.accounts.accounts.map((entry) => {
                const selected = entry.id === switching.accounts.current;
                return (
                  <li key={entry.id}>
                    <button type="button" aria-current={selected ? "true" : undefined} disabled={pending} onClick={() => switchTo(entry.id)} className={cn(ROW, "h-11", switchingTo === entry.id && "opacity-60")}>
                      {entry.kind === "workspace" ? <WorkspaceMark name={entry.name} className={SLOT} /> : <Avatar account={account} className={SLOT} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium leading-[18px]">{entry.name}</span>
                        <span className="block truncate text-[11px] leading-[15px] text-subtle-foreground">
                          {entry.kind === "workspace" ? `${ROLE_LABEL[entry.role]}${entry.status === "paused" ? " · Suspended" : ""}` : "Personal"}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{count(selected ? credits : entry.credits)}</span>
                      <Check className={cn("size-3.5 shrink-0 text-foreground", selected ? "opacity-100" : "opacity-0")} strokeWidth={2.25} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
            {switching.accounts.invitations.map((invitation) => (
              <PopoverClose asChild key={invitation.id}>
                <Link href={`/join/${invitation.token}`} className={cn(ROW, "h-11")}>
                  {/* Dashed: a workspace you don't belong to yet. */}
                  <span aria-hidden className={cn(SLOT, "inline-flex shrink-0 items-center justify-center rounded-[9px] border border-dashed border-input font-semibold text-muted-foreground")}>
                    {invitation.workspace_name.trim()[0]?.toUpperCase() ?? "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium leading-[18px]">{invitation.workspace_name}</span>
                    <span className="block truncate text-[11px] leading-[15px] text-subtle-foreground">Invited by {invitation.invited_by_name}</span>
                  </span>
                  <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-secondary px-2.5 text-[11px] font-medium text-secondary-foreground">Join</span>
                </Link>
              </PopoverClose>
            ))}
            <button
              type="button"
              className={cn(ROW, "text-muted-foreground hover:text-foreground")}
              onClick={() => {
                setOpen(false);
                setError(null);
                setWorkspaceName("");
                setCreating(true);
              }}
            >
              <Lead icon={Plus} />
              Create workspace
            </button>
          </>
        ) : (
          <div className="flex min-h-11 items-center gap-2.5 px-2 py-1">
            <Avatar account={account} className={SLOT} />
            <div className="min-w-0">
              <p className="truncate text-body font-medium leading-[18px]">{name}</p>
              <p className="flex items-center gap-1 text-[11px] leading-[15px] text-subtle-foreground">
                {account ? (
                  <span className="flex items-center gap-1 font-mono">
                    <Coins className="size-3" aria-hidden />
                    <RollingNumber value={credits} /> credits
                  </span>
                ) : (
                  "Sign in to generate and save your work"
                )}
              </p>
            </div>
          </div>
        )}

        {account ? (
          <>
            {RULE}
            {/* One page holds both, so one row leads to it. Only someone who can buy is offered credits by name. */}
            <Item href="/settings/plan" icon={Coins}>{!current || can(current.role, "manage_billing") ? "Plan and credits" : "Plan"}</Item>
            {workspace ? <Item href="/settings/workspace" icon={Users}>Members</Item> : null}
            <Item href="/settings" icon={Settings2}>Settings</Item>
            <Item href="/settings/privacy" icon={ShieldCheck}>Who can see what</Item>
            {account.role === "operator" && consoleAvailable ? <Item href="/operator" icon={Wrench}>Operator console</Item> : null}
          </>
        ) : null}

        {RULE}
        {/* Leaving and the theme share the last row: the theme is a glance-and-tap control, not a destination. */}
        <div className="flex items-center gap-1">
          {account ? (
            <form action={signOutAction} method="post" className="min-w-0 flex-1">
              <button type="submit" className={ROW}>
                <Lead icon={LogOut} />
                Sign out
              </button>
            </form>
          ) : (
            <a href={signInHref} className={cn(ROW, "min-w-0 flex-1")}>
              <Lead icon={LogIn} />
              Sign in or sign up
            </a>
          )}
          <button
            type="button"
            aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={resolved === "dark" ? "Light theme" : "Dark theme"}
            onClick={() => setPreference(resolved === "dark" ? "light" : "dark")}
            className="flex size-9 shrink-0 items-center justify-center rounded-field text-muted-foreground transition-colors duration-150 hover:bg-hover hover:text-foreground"
          >
            {resolved === "dark" ? <Sun className="size-4" strokeWidth={1.75} /> : <Moon className="size-4" strokeWidth={1.75} />}
          </button>
        </div>
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

import type { WorkspaceRole } from "@livepeer/api-client/provider";
import { cn } from "@livepeer/ui";

/** How an action that can be refused answers: the result, or words to show the person. */
export type Outcome<T = null> = { ok: true; data: T } | { ok: false; error: string };

export const ROLE_LABEL: Record<WorkspaceRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export const ROLE_SUMMARY: Record<WorkspaceRole, string> = {
  owner: "Handles the plan and credit, and everything an admin does.",
  admin: "Invites and removes people, makes API keys and sees everyone's usage.",
  member: "Makes things with the workspace's credit and sees their own usage.",
};

/** The same, said to the person who is about to hold the role. */
export const ROLE_FOR_YOU: Record<Exclude<WorkspaceRole, "owner">, string> = {
  admin: "Invite and remove people, make API keys and see everyone's usage, as well as making things.",
  member: "Make things with the workspace's credit, and see what you've used.",
};

export const count = (value: number) => new Intl.NumberFormat("en").format(value);

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

/** A workspace's mark: a rounded square with its initial, so it never reads as a person's round avatar. */
export function WorkspaceMark({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-secondary text-[12px] font-semibold text-secondary-foreground ring-1 ring-hairline", className)}>
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

export function PersonMark({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[12px] font-semibold text-secondary-foreground ring-1 ring-hairline", className)}>
      {initials(name)}
    </span>
  );
}

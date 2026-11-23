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

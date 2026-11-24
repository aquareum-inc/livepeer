"use client";

import { BrandBadge, BrandWordmark, cn, useTheme, type Brand } from "@livepeer/ui";
import { Activity, ArrowLeft, Blocks, Building2, Cpu, CreditCard, Flag, Gift, KeyRound, LayoutDashboard, Moon, ReceiptText, ServerCog, Settings2, Sun, Tags, Users, type LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

export interface ConsoleLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-current"?: "page" | undefined;
}

const GROUPS: Array<{ label: string; items: Array<{ href: string; label: string; icon: LucideIcon }> }> = [
  {
    label: "Operate",
    items: [
      { href: "/operator", label: "Overview", icon: LayoutDashboard },
      { href: "/operator/users", label: "Users", icon: Users },
      { href: "/operator/workspaces", label: "Workspaces", icon: Building2 },
      { href: "/operator/jobs", label: "Jobs", icon: Activity },
      { href: "/operator/reports", label: "Reports", icon: Flag },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/operator/pricing", label: "Pricing and plans", icon: Tags },
      { href: "/operator/billing", label: "Billing", icon: CreditCard },
      { href: "/operator/costs", label: "Costs", icon: ReceiptText },
      { href: "/operator/grants", label: "Grants", icon: Gift },
    ],
  },
  {
    label: "Network",
    items: [
      { href: "/operator/capabilities", label: "Capabilities", icon: Blocks },
      { href: "/operator/compute", label: "Compute", icon: Cpu },
    ],
  },
  {
    label: "Instance",
    items: [
      { href: "/operator/settings", label: "Settings", icon: Settings2 },
      { href: "/operator/keys", label: "Keys", icon: KeyRound },
      { href: "/operator/system", label: "System", icon: ServerCog },
    ],
  },
];

const active = (pathname: string, href: string) => (href === "/operator" ? pathname === href : pathname.startsWith(href));

/** A quiet mark on a page's name in the navigation: something there is new, said in words to a screen reader. */
function Mark({ says }: { says: string }) {
  return (
    <>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-foreground" />
      <span className="sr-only">, {says}</span>
    </>
  );
}

export interface ConsoleShellProps {
  brand: Brand;
  pathname: string;
  Link: ComponentType<ConsoleLinkProps>;
  appAvailable: boolean;
  /** Pages to mark with a dot in the navigation, by href, each with what the dot means. */
  marks?: Readonly<Record<string, string>>;
  children: ReactNode;
}

/** The console's frame: the same sidebar-and-panel as the user app, tuned denser. */
export function ConsoleShell({ brand, pathname, Link, appAvailable, marks = {}, children }: ConsoleShellProps) {
  const { resolved, setPreference } = useTheme();
  const items = GROUPS.flatMap((group) => group.items);
  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <nav aria-label="Operator console" className="hidden w-[216px] shrink-0 flex-col overflow-y-auto px-3 py-4 md:flex">
        {/* The wordmark and the console's name, one link home; the badge sparkles while it's hovered or focused. */}
        <Link href="/operator" aria-label="Operator console overview" className="mb-4 flex h-8 items-center gap-2.5 self-start rounded-full px-2 outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <BrandWordmark brand={brand} className="h-[12px] w-auto shrink-0" />
          <BrandBadge label="Operator" />
        </Link>
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="px-2 pb-1 text-[11px] font-medium text-subtle-foreground">{group.label}</p>
            {group.items.map((item) => {
              const current = active(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-full px-2.5 text-[13px] font-medium transition-colors duration-150",
                    current ? "bg-active text-foreground" : "text-muted-foreground hover:bg-hover hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className="flex-1">{item.label}</span>
                  {marks[item.href] ? <Mark says={marks[item.href] as string} /> : null}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="mt-auto flex items-center justify-between pt-2">
          {appAvailable ? (
            <Link href="/" className="flex h-8 items-center gap-2 rounded-full px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground">
              <ArrowLeft className="size-4" />App
            </Link>
          ) : <span />}
          <button
            type="button"
            onClick={() => setPreference(resolved === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          >
            {resolved === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </button>
        </div>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:py-2 md:pr-2">
        <div className="scrollbar-none flex h-12 shrink-0 items-center gap-1 overflow-x-auto px-3 md:hidden">
          {items.map((item) => {
            const current = active(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined} className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium", current ? "bg-active text-foreground" : "text-muted-foreground")}>
                {item.label}
                {marks[item.href] ? <Mark says={marks[item.href] as string} /> : null}
              </Link>
            );
          })}
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto bg-panel md:rounded-card md:ring-1 md:ring-hairline">{children}</main>
      </div>
    </div>
  );
}

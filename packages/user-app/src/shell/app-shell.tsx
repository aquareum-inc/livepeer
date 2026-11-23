"use client";

import { BrandProvider, BrandSymbol, BrandWordmark, cn, type Brand } from "@livepeer/ui";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useState, type ComponentType, type ReactNode } from "react";

import { AccountProvider } from "./account";
import { AccountMenu, type Account, type AccountSwitching } from "./account-menu";
import { LinkProvider, type LinkProps } from "./link";
import { NAV_ITEMS, isActive } from "./nav";
import { SIDEBAR_COOKIE } from "./sidebar";

export interface AppShellProps {
  /** The instance's name and marks, from its config. */
  brand: Brand;
  pathname: string;
  /** The host's link component, so the shell stays framework-agnostic. */
  Link: ComponentType<LinkProps>;
  /** Routes that exist in this build; others are shown but not yet reachable. */
  availableRoutes: ReadonlyArray<string>;
  /** Sections the instance can switch off; switched off, they aren’t shown. */
  features: { characters: boolean; developers: boolean };
  /** Recent conversations, listed when the sidebar is open. */
  recents: ReadonlyArray<{ href: string; title: string }>;
  /** The signed-in person, or null for a guest. */
  account: Account | null;
  /** The accounts the person can work in and how to switch; null for a guest or where there are no workspaces. */
  switching: AccountSwitching | null;
  signOutAction: string;
  signInHref: string;
  consoleAvailable: boolean;
  /** Whether the sidebar starts open, read by the host from the SIDEBAR_COOKIE cookie so the first paint is already right. */
  initialOpen: boolean;
  children: ReactNode;
}


/** Collapsed, the mark is the toggle: it turns into the open icon on hover or focus. */
function SidebarToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "Close sidebar" : "Open sidebar"}
      aria-expanded={open}
      className={cn(
        "group relative inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-200 ease-out-expo hover:bg-hover active:scale-[0.92]",
        open ? "text-muted-foreground hover:text-foreground" : "mx-auto text-foreground",
      )}
    >
      {open ? (
        <PanelLeftClose className="size-[18px]" strokeWidth={1.75} />
      ) : (
        <>
          <BrandSymbol className="h-[20px] w-auto transition-[opacity,transform] duration-200 ease-out-expo group-hover:scale-75 group-hover:opacity-0 group-focus-visible:scale-75 group-focus-visible:opacity-0" />
          <PanelLeftOpen
            className="absolute size-[18px] scale-75 opacity-0 transition-[opacity,transform] duration-200 ease-out-expo group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"
            strokeWidth={1.75}
          />
        </>
      )}
    </button>
  );
}

export function AppShell({ brand, pathname, Link, availableRoutes, features, recents, account, switching, signOutAction, signInHref, consoleAvailable, initialOpen, children }: AppShellProps) {
  const current = switching?.accounts.accounts.find((entry) => entry.id === switching.accounts.current) ?? null;
  const menu = { account, switching, signOutAction, signInHref, consoleAvailable };
  const items = NAV_ITEMS.filter((item) => (item.href !== "/characters" || features.characters) && (item.href !== "/developers" || features.developers));
  const [open, setOpen] = useState(initialOpen);

  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "open" : "closed"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  const reachable = (href: string) => availableRoutes.includes(href);

  return (
    <BrandProvider brand={brand}>
    <LinkProvider Link={Link}>
    <AccountProvider account={current}>
    {/* Fades in once when the page loads; the layout persists across navigation, so it doesn't repeat. */}
    <div className="flex h-dvh animate-[fade-in_360ms_var(--ease-out-expo)] overflow-hidden bg-background text-foreground">
      {/* Sidebar (tablet and up): a rail of icons, or open with the wordmark and labels */}
      <nav
        aria-label="Primary"
        data-open={open || undefined}
        className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col gap-1 overflow-hidden px-3 py-4 transition-[width] duration-300 ease-out-expo data-[open]:w-[232px] md:flex"
      >
        <div className="mb-3 flex h-10 items-center justify-between">
          {open ? (
            <>
              <Link href="/" aria-label={`${brand.name} home`} className="inline-flex h-10 items-center px-2 text-foreground">
                <BrandWordmark className="h-[14px] w-auto shrink-0" />
              </Link>
              <SidebarToggle open onToggle={toggle} />
            </>
          ) : (
            <SidebarToggle open={false} onToggle={toggle} />
          )}
        </div>
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const content = (
            <>
              {active ? (
                <motion.span
                  layoutId="rail-active"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  className="absolute inset-0 rounded-full bg-active"
                />
              ) : null}
              <item.icon className="relative size-[18px] shrink-0" strokeWidth={1.75} />
              <span
                className={cn(
                  "relative whitespace-nowrap font-medium",
                  open ? "text-body" : "text-[10.5px] leading-3",
                )}
              >
                {item.label}
              </span>
            </>
          );
          const className = cn(
            "relative flex shrink-0 items-center transition-colors duration-200",
            open ? "h-10 gap-3 rounded-full px-3.5" : "h-[52px] flex-col justify-center gap-1 rounded-field",
            active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          );
          return reachable(item.href) ? (
            <Link key={item.href} href={item.href} className={className} aria-current={active ? "page" : undefined}>
              {content}
            </Link>
          ) : (
            <span key={item.href} className={cn(className, "cursor-default opacity-45 hover:text-muted-foreground")} title="Built in a later slice">
              {content}
            </span>
          );
        })}
        {open && recents.length > 0 ? (
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <p className="px-3.5 pb-1.5 text-caption font-medium text-subtle-foreground">Recent</p>
            <ul className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
              {recents.map((recent) => (
                <li key={recent.href}>
                  <Link
                    href={recent.href}
                    aria-current={pathname === recent.href ? "page" : undefined}
                    className={cn(
                      "block truncate rounded-full px-3.5 py-2 text-body transition-colors duration-150 hover:bg-hover hover:text-foreground",
                      pathname === recent.href ? "bg-hover text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {recent.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className={cn("mt-auto flex shrink-0 pt-2", open ? "" : "justify-center")}>
          <AccountMenu {...menu} expanded={open} />
        </div>
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:py-2 md:pr-2">
        {/* Top bar (phone) */}
        <header className="flex h-14 items-center justify-between px-4 md:hidden">
          <Link href="/" aria-label={`${brand.name} home`} className="inline-flex h-10 items-center text-foreground">
            <BrandWordmark className="h-[15px] w-auto shrink-0" />
          </Link>
          <AccountMenu {...menu} side="bottom" />
        </header>

        <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-panel pb-[88px] md:rounded-card md:pb-0 md:ring-1 md:ring-hairline">
          {children}
        </main>

        {/* Tab bar (phone) */}
        <nav
          aria-label="Primary"
          className="fixed inset-x-3 bottom-3 z-40 flex h-16 items-center justify-around rounded-sheet border border-hairline bg-popover/90 px-2 shadow-float backdrop-blur-xl md:hidden"
        >
          {items.filter((item) => item.primary).map((item) => {
            const active = isActive(pathname, item.href);
            const className = cn(
              "flex w-16 flex-col items-center gap-1 text-[10.5px] font-medium",
              active ? "text-foreground" : "text-muted-foreground",
            );
            const content = (
              <>
                <item.icon className="size-5" strokeWidth={1.75} />
                {item.label}
              </>
            );
            return reachable(item.href) ? (
              <Link key={item.href} href={item.href} className={className} aria-current={active ? "page" : undefined}>
                {content}
              </Link>
            ) : (
              <span key={item.href} className={cn(className, "opacity-45")}>
                {content}
              </span>
            );
          })}
        </nav>
      </div>
    </div>
    </AccountProvider>
    </LinkProvider>
    </BrandProvider>
  );
}

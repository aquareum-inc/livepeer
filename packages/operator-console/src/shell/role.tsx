"use client";

import { operatorCan, type OperatorAction, type OperatorRole } from "@livepeer/api-client";
import { createContext, useCallback, useContext, type ReactNode } from "react";

/** With no provider, nothing may be changed: a view drawn outside the console's frame is read-only. */
const RoleContext = createContext<OperatorRole>("viewer");

/** Tells every view below what the signed-in operator may do. The server decides again on every change. */
export function OperatorRoleProvider({ role, children }: { role: OperatorRole; children: ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useOperatorRole(): OperatorRole {
  return useContext(RoleContext);
}

/** Whether the signed-in operator's role allows a change, so a view leaves out what would only be refused. */
export function useOperatorCan(): (action: OperatorAction) => boolean {
  const role = useContext(RoleContext);
  return useCallback((action: OperatorAction) => operatorCan(role, action), [role]);
}

/**
 * Settings the signed-in operator can read but not change: every control inside is switched off at once,
 * with one line saying who can change them.
 */
export function OwnersOnly({ allowed, what, children }: { allowed: boolean; what: string; children: ReactNode }) {
  if (allowed) return <>{children}</>;
  return (
    <>
      <p role="note" className="mb-4 rounded-card border border-hairline bg-muted px-4 py-2.5 text-[13px] text-muted-foreground">
        You can see {what} but not change {what === "these settings" ? "them" : "it"}. An owner can.
      </p>
      <fieldset disabled className="m-0 min-w-0 border-0 p-0">
        {children}
      </fieldset>
    </>
  );
}

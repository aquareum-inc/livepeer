"use client";

import type { AccountSummary } from "@livepeer/api-client";
import { createContext, useContext, type ReactNode } from "react";

const AccountContext = createContext<AccountSummary | null>(null);

/** The account the person is working in (their own, or a workspace), for screens that change with it. */
export function AccountProvider({ account, children }: { account: AccountSummary | null; children: ReactNode }) {
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

/** Null for a guest. */
export function useAccount(): AccountSummary | null {
  return useContext(AccountContext);
}

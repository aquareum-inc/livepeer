"use client";

import { ConsoleShell, type ConsoleLinkProps } from "@livepeer/operator-console";
import type { OperatorRole } from "@livepeer/api-client";
import type { Brand } from "@livepeer/ui";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function ConsoleLink({ href, ...props }: ConsoleLinkProps) {
  return <NextLink href={href} {...props} />;
}

export function Console({ brand, appAvailable, marks, role, children }: { brand: Brand; appAvailable: boolean; marks: Readonly<Record<string, string>>; role: OperatorRole; children: ReactNode }) {
  return (
    <ConsoleShell brand={brand} pathname={usePathname()} Link={ConsoleLink} appAvailable={appAvailable} marks={marks} role={role}>
      {children}
    </ConsoleShell>
  );
}

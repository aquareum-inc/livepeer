"use client";

import { ConsoleShell, type ConsoleLinkProps } from "@livepeer/operator-console";
import type { Brand } from "@livepeer/ui";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function ConsoleLink({ href, ...props }: ConsoleLinkProps) {
  return <NextLink href={href} {...props} />;
}

export function Console({ brand, appAvailable, marks, children }: { brand: Brand; appAvailable: boolean; marks: Readonly<Record<string, string>>; children: ReactNode }) {
  return (
    <ConsoleShell brand={brand} pathname={usePathname()} Link={ConsoleLink} appAvailable={appAvailable} marks={marks}>
      {children}
    </ConsoleShell>
  );
}

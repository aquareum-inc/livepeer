import "@fontsource-variable/inter";
import "./globals.css";

import { THEME_INIT_SCRIPT, ThemeProvider } from "@livepeer/ui";
import { GeistMono } from "geist/font/mono";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { instance } from "@/lib/instance";

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await instance();
  return {
    title: { default: name, template: `%s · ${name}` },
    description: "Generate, edit, understand and interact with video on an open network.",
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#f4f4f5" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={GeistMono.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

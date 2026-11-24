import "server-only";

import { headers } from "next/headers";

import { instance } from "./instance";

/** The instance's public origin, for code samples: the configured domain, else the request's host. */
export async function origin(): Promise<string> {
  const { domain } = await instance();
  if (domain) return `https://${domain}`;
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const protocol = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocol}://${host}`;
}

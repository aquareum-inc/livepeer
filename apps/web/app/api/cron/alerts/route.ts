import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { runAlertRound } from "@/lib/alerts/round";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
/** A round waits up to ten seconds for the engine, twice, before it sends anything. */
export const maxDuration = 60;

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Runs one round of the instance's checks, for a host with no server between requests: a scheduler calls
 * this every minute with `Authorization: Bearer $CRON_SECRET`, which is how Vercel Cron calls a route. To
 * anyone else, and on an instance with no CRON_SECRET, there is no such page. Calling it more often than a
 * round is due does nothing.
 */
export async function GET(request: NextRequest) {
  const secret = env("CRON_SECRET");
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ") || !same(header.slice(7), secret)) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json({ ran: await runAlertRound() });
}

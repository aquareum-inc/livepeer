import { NextResponse } from "next/server";

import { roundStatus } from "@/lib/alerts/round";
import { databaseStatus } from "@/lib/data/database";
import { env } from "@/lib/env";
import { instance } from "@/lib/instance";
import { storageStatus } from "@/lib/media/storage";

export const dynamic = "force-dynamic";

/** Liveness and a quick readiness summary for the bundle's health check and `doctor`. */
export async function GET() {
  // The config can need the database. If neither it nor a last-known copy can be had, say so plainly: this
  // is what a load balancer and `doctor` ask, and it must answer when the database doesn't.
  const config = await instance().catch(() => null);
  if (!config) return NextResponse.json({ status: "degraded", database: await databaseStatus() }, { status: 503 });
  const mockOnly = env("MOCK_ONLY") === "1" || env("MOCK_ONLY") === "true";
  const engineUrl = config.engine?.url ?? env("ENGINE_URL");
  let engine: "ok" | "unreachable" | "skipped" = "skipped";
  if (!mockOnly && engineUrl) {
    try {
      const response = await fetch(new URL("/readyz", engineUrl), { cache: "no-store", signal: AbortSignal.timeout(3000) });
      engine = response.ok ? "ok" : "unreachable";
    } catch {
      engine = "unreachable";
    }
  }
  // "behind" is a database that hasn't had this release's migrations: the app must not serve on it.
  const database = await databaseStatus();
  const ok = engine !== "unreachable" && database !== "unreachable" && database !== "behind";
  // Whether anything is running the checks behind operators' alerts. Said here for `doctor`; it doesn't make
  // the instance unhealthy, since everything else works without them.
  // Where files are kept and whether that can be used. Said here for `doctor`; without it uploads are refused
  // with a reason and everything else works, so it doesn't make the instance unhealthy.
  const storage = await storageStatus().then(({ kind, status }) => ({ kind, status }), () => ({ kind: "unknown", status: "unavailable" }));
  const alerts = database === "unreachable" ? "unknown" : (await roundStatus().catch(() => ({ status: "unknown" as const }))).status;
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", instance: config.name, mode: mockOnly ? "mock-only" : "live", surfaces: config.surfaces, engine, database, alerts, storage },
    { status: ok ? 200 : 503 },
  );
}

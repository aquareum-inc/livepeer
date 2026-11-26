import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session";

/** Signs out. A form may name a path on this instance to go to next, such as back to sign in as someone else. */
export async function POST(request: NextRequest) {
  const next = (await request.formData().catch(() => null))?.get("next");
  const path = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

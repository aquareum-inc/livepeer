import { NextResponse, type NextRequest } from "next/server";

import { checkAccess, requiredRole } from "@/lib/auth/guard";
import { SESSION_COOKIE, current, readSessionValue } from "@/lib/auth/session";
import { developerPathServed } from "@/lib/developers";
import { instance } from "@/lib/instance";
import { firstOwnerOpen } from "@/lib/operators/first-owner";
import { SETUP_PATH } from "@/lib/operators/links";
import { homePath, surfacePathServed } from "@/lib/surfaces";

/**
 * Runs before every page: turns off surfaces the instance doesn't serve, and applies the role
 * guard. Layouts check again, so a route is never protected by this file alone.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { surfaces } = await instance();
  const isApi = pathname.startsWith("/api/");
  // With no app, the front door is the console.
  if (pathname === "/" && homePath(surfaces) !== "/") return NextResponse.redirect(new URL(homePath(surfaces), request.url));
  if (!surfacePathServed(pathname, surfaces) || !developerPathServed(pathname, surfaces)) return new NextResponse("Not found", { status: 404 });
  if (isApi) return NextResponse.next();

  const sealed = readSessionValue(request.cookies.get(SESSION_COOKIE)?.value);
  // Only the console asks whether a place on the team still stands; every other page takes the cookie's word.
  const access = checkAccess(pathname, requiredRole(pathname) === "operator" ? await current(sealed) : sealed);
  if (access === "sign-in") {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  // Hidden from users: the console looks like it doesn't exist.
  if (access === "forbidden") {
    // Unless nobody runs the instance yet, and whoever is signed in may become its owner.
    if (await firstOwnerOpen()) return NextResponse.redirect(new URL(SETUP_PATH, request.url));
    return new NextResponse("Not found", { status: 404 });
  }
  // Tell layouts which page this is, so they can apply the same guard themselves.
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Static files in public/ (images, video, fonts) are served to everyone, signed in or not.
  // Nor does a file on its way to or from the instance's own disk pass through here: its address is its
  // permission, and this would hold a copy of the body in memory.
  matcher: ["/((?!_next/|api/storage/|favicon.ico|.*\\.(?:svg|png|jpe?g|gif|ico|webp|avif|mp4|webm|mov|woff2?)$).*)"],
};

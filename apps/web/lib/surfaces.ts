import { JOIN_PATH, SETUP_PATH } from "./operators/links";

/** The surfaces an instance can serve, as the instance config sets them. */
export interface Surfaces {
  app: boolean;
  console: boolean;
  api: boolean;
  mcp: boolean;
  /** The native apps. They use the API and the sign-in flow, so either is served while this is on. */
  mobile?: boolean;
  /** The operator console inside the native apps. It uses the API and the sign-in flow too, with its own sessions. */
  mobileConsole?: boolean;
}

/** Sign-in and the auth flow: needed by the app and by the console, so served while either is. The apps use the flow itself. */
export function isAuthPath(pathname: string): boolean {
  return pathname === "/sign-in" || pathname === "/auth" || pathname.startsWith("/auth/");
}

/**
 * Whether the instance serves a path, by the surfaces it has on. The console and the API keep their own
 * prefixes; sign-in serves whichever of the app and the console is on; everything else is the app.
 */
export function surfacePathServed(pathname: string, surfaces: Surfaces): boolean {
  const phones = surfaces.mobile === true || surfaces.mobileConsole === true;
  if (pathname === "/operator" || pathname.startsWith("/operator/")) return surfaces.console;
  // The native apps are clients of the API. With the API off they still reach it, as device sessions only.
  if (pathname.startsWith("/api/v1")) return surfaces.api || phones;
  if (pathname.startsWith("/api/mcp")) return surfaces.mcp;
  if (pathname.startsWith("/api/")) return true;
  if (pathname === "/auth/start" || pathname === "/auth/callback") return surfaces.app || surfaces.console || phones;
  if (isAuthPath(pathname)) return surfaces.app || surfaces.console;
  // An invitation to the team that runs the instance opens wherever there is a console to join.
  if (pathname.startsWith(JOIN_PATH)) return surfaces.console;
  // Where the first owner claims an instance nobody runs yet.
  if (pathname === SETUP_PATH) return surfaces.console;
  return surfaces.app;
}

/** Where to send someone with nothing in particular to open: the app if there is one, otherwise the console. */
export function homePath(surfaces: Surfaces): string {
  return !surfaces.app && surfaces.console ? "/operator" : "/";
}

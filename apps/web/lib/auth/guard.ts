import type { Role, Session } from "./types";

export type Access = "allow" | "sign-in" | "forbidden";

/**
 * Paths that need no session. Guests can look around the product: Home, the studio, the public
 * characters, their own (empty) library and the developer docs. Doing anything asks them to sign in
 * (`lib/actions.ts`). Pages that only make sense for an account (chats, settings, keys, creating or
 * calling a character) still need one.
 */
const PUBLIC = [
  /^\/$/,
  /^\/sign-in$/,
  /^\/auth\//,
  /^\/api\/health$/,
  // An invitation to the team can be read signed out; joining asks for a sign-in.
  /^\/join\/operator\/[^/]+$/,
  /^\/studio(\/[^/]+)?$/,
  /^\/characters$/,
  /^\/characters\/(?!new$)[^/]+$/,
  /^\/library$/,
  /^\/developers$/,
  /^\/developers\/(models|examples|playground)(\/.*)?$/,
];

/** Which role a path needs: operator for the console, a signed-in user for everything else. */
export function requiredRole(pathname: string): Role | null {
  if (PUBLIC.some((pattern) => pattern.test(pathname))) return null;
  if (pathname === "/operator" || pathname.startsWith("/operator/")) return "operator";
  return "user";
}

/** The role guard. Operators can use the user app; users cannot reach the console. */
export function checkAccess(pathname: string, session: Pick<Session, "role" | "expiresAt"> | null, now = Date.now()): Access {
  const needed = requiredRole(pathname);
  if (needed === null) return "allow";
  if (!session || session.expiresAt * 1000 <= now) return "sign-in";
  if (needed === "operator" && session.role !== "operator") return "forbidden";
  return "allow";
}

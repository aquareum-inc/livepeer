/** How recent the provider's own sign-in must be for what asks for a new one: enrolling a phone for the console, joining the team. */
export const FRESH_SECONDS = 300;

/** Whether a sign-in the provider timed is recent enough. One it didn't time never is. */
export function isFresh(authenticatedAt: number | null | undefined, now: number = Date.now()): boolean {
  return typeof authenticatedAt === "number" && Math.abs(now / 1000 - authenticatedAt) <= FRESH_SECONDS;
}

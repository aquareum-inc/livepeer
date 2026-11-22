/**
 * Runs once when the server starts. The only thing it starts is the watcher behind operators' alerts
 * (docs/mobile/plan.md, section 18.9), which needs a server that stays running between requests.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAlertWatcher } = await import("./lib/alerts/watcher");
  startAlertWatcher();
}

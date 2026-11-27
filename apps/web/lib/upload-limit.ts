import "server-only";

import { env } from "./env";

/**
 * The largest file this host lets through to the app, in bytes, when the host says it has such a limit
 * (UPLOAD_LIMIT_MB). A serverless host turns a larger request away before the app sees it, so the app has
 * to refuse the file itself, with words, when the upload is asked for. Undefined: only the app's own limits
 * apply. A value that isn't a positive number is no limit, not a limit of nothing.
 */
export function uploadLimitBytes(): number | undefined {
  const megabytes = Number(env("UPLOAD_LIMIT_MB"));
  return Number.isFinite(megabytes) && megabytes > 0 ? Math.floor(megabytes * 1024 * 1024) : undefined;
}

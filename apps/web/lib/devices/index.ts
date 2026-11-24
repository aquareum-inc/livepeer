import "server-only";

import { sessionSecret } from "../auth/session";
import { storeOver } from "../data/database";
import { instance } from "../instance";
import { postgresDeviceSessionStore } from "./postgres";
import { deviceSessions, type DeviceSessions, type Platform } from "./sessions";

const store = storeOver(postgresDeviceSessionStore);

/** The instance's device sessions. */
export function devices(): DeviceSessions {
  const secret = sessionSecret();
  return deviceSessions(store(secret), secret);
}

/** Whether the instance serves the native apps at all. */
export async function mobileEnabled(): Promise<boolean> {
  return (await instance()).surfaces.mobile === true;
}

/**
 * Where a finished sign-in returns to: `<identifier>://auth` for the app built for this instance. Null when
 * the instance names no app for that platform, so a sign-in can't be handed to an app it doesn't know.
 */
export async function appCallback(platform: Platform): Promise<string | null> {
  const apps = (await instance()).mobile;
  const identifier = platform === "ios" ? apps?.ios?.bundleId : apps?.android?.applicationId;
  return identifier ? `${identifier.toLowerCase()}://auth` : null;
}

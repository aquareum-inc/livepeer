import "server-only";

import type { InstanceDescription, SignInMethodName } from "@livepeer/api-client";
import { colourToHex } from "@livepeer/config";

import { signInMethods } from "../auth/methods";
import { instance } from "../instance";

export const API_VERSION = "1";

/** Theme overrides as sRGB hex. An override that isn't a colour this can resolve is left out, so the default shows. */
function hexTokens(tokens: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(tokens ?? {}).flatMap(([name, value]) => {
    const hex = colourToHex(value);
    return hex ? [[name, hex]] : [];
  }));
}

/**
 * Where a request reached the instance, as the caller addressed it. Read from the Host header (or the
 * proxy's forwarded host), because a client such as the Android emulator reaches a development server at
 * an address that isn't the server's own idea of its origin.
 */
export function requestOrigin(request: { headers: Headers; nextUrl: { origin: string; protocol: string } }): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host || !/^[\w.-]+(:\d+)?$/.test(host)) return request.nextUrl.origin;
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${protocol === "https" ? "https" : "http"}://${host}`;
}

/**
 * The instance's public address: its configured domain, or else where the request arrived. Sign-in builds
 * its callback from this, so a phone that reached a development server at another address comes back to it.
 */
export function publicOrigin(request: { headers: Headers; nextUrl: { origin: string; protocol: string } }): string {
  const domain = instance().domain;
  return domain ? `https://${domain}` : requestOrigin(request);
}

/**
 * This instance as it describes itself to clients. `origin` is where the request arrived, used to make
 * paths absolute when the config has no public domain.
 */
export function describeInstance(origin: string): InstanceDescription {
  const config = instance();
  const base = config.domain ? `https://${config.domain}` : origin;
  const absolute = (value: string | undefined): string | null => (value ? (/^(https?:|data:)/.test(value) ? value : new URL(value, base).toString()) : null);
  return {
    api_version: API_VERSION,
    name: config.name,
    logo: { symbol: absolute(config.logo?.symbol), wordmark: absolute(config.logo?.wordmark), tint: config.logo?.tint ?? true },
    theme: { dark: hexTokens(config.theme?.dark), light: hexTokens(config.theme?.light) },
    surfaces: { app: config.surfaces.app, console: config.surfaces.console, api: config.surfaces.api, mcp: config.surfaces.mcp, mobile: config.surfaces.mobile ?? false, mobile_console: config.surfaces.mobileConsole ?? false },
    mobile: {
      ios: config.mobile?.ios ? { bundle_id: config.mobile.ios.bundleId, minimum_version: config.mobile.ios.minimumVersion ?? null } : null,
      android: config.mobile?.android
        ? {
            application_id: config.mobile.android.applicationId,
            minimum_version: config.mobile.android.minimumVersion ?? null,
            firebase: config.mobile.android.firebase
              ? { project_id: config.mobile.android.firebase.projectId, app_id: config.mobile.android.firebase.appId, api_key: config.mobile.android.firebase.apiKey, sender_id: config.mobile.android.firebase.senderId }
              : null,
          }
        : null,
    },
    sign_in: { methods: signInMethods().filter((method): method is SignInMethodName => method !== "operator"), sign_up: config.auth?.signUp ?? "open" },
    content: { characters: config.content?.characters ?? false, adult_content: config.content?.adultContent ?? false },
    home: {
      background_image: absolute(config.home?.backgroundImage),
      background_poster: absolute(config.home?.backgroundPoster),
      background_video: absolute(config.home?.backgroundVideo),
      aurora: config.home?.aurora ?? false,
    },
  };
}

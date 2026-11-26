import "server-only";

import { NextResponse } from "next/server";

import { mobileConsoleEnabled } from "../operator-devices";
import { appCallback, mobileEnabled } from "./index";
import type { Platform } from "./sessions";

/** What a native sign-in carries through the provider's round trip, in the sealed flow cookie. */
export interface NativeFlow {
  platform: Platform;
  /**
   * What the sign-in is for: the user app's device session, or the console's operator device session, which
   * needs a new sign-in at the provider and an identity it marks as an operator.
   */
  purpose: "user" | "operator";
  /** The app's PKCE challenge: base64url(SHA-256(verifier)). */
  challenge: string;
  /** The app's own state, returned to it unchanged. */
  state: string;
}

/** Why a native sign-in ended without a session, as the app reads it from its callback. */
export type NativeFailure = "mobile_off" | "mobile_console_off" | "not_operator" | "not_fresh" | "method" | "expired" | "failed" | "closed";

/** Sends the system auth session back to the app. */
export function returnToApp(callback: string, values: Record<string, string>): NextResponse {
  const url = new URL(callback);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return NextResponse.redirect(url.toString());
}

/**
 * Reads a native start: `client`, `challenge`, `state` and, for the console, `purpose=operator`. Null for a browser sign-in. A request naming an
 * app the instance doesn't know is refused outright: there is nowhere safe to send the result.
 */
export async function nativeStart(params: URLSearchParams): Promise<{ flow: NativeFlow; fail: (reason: NativeFailure) => NextResponse } | { refusal: NextResponse } | null> {
  const client = params.get("client");
  if (client === null) return null;
  const platform = client === "ios" || client === "android" ? client : null;
  const callback = platform ? await appCallback(platform) : null;
  if (!platform || !callback) return { refusal: new NextResponse("This instance has no app for that platform.", { status: 400 }) };

  const state = params.get("state") ?? "";
  const fail = (reason: NativeFailure) => returnToApp(callback, { error: reason, state });
  const challenge = params.get("challenge") ?? "";
  // A SHA-256 digest in base64url is 43 characters.
  if (!/^[\w-]{43}$/.test(challenge) || !/^[\w-]{16,128}$/.test(state)) return { refusal: new NextResponse("A native sign-in needs a challenge and a state.", { status: 400 }) };
  const purpose = params.get("purpose") === "operator" ? "operator" : "user";
  // Each kind of session has its own switch; neither sign-in starts while its own is off.
  if (!(purpose === "operator" ? await mobileConsoleEnabled() : await mobileEnabled())) return { refusal: fail(purpose === "operator" ? "mobile_console_off" : "mobile_off") };
  return { flow: { platform, purpose, challenge, state }, fail };
}

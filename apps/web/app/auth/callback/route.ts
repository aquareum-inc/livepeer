import { NextResponse, type NextRequest } from "next/server";

import { seal, unseal } from "@/lib/auth/seal";
import { FLOW_COOKIE, SESSION_COOKIE, authProvider, createSession, sessionSecret } from "@/lib/auth/session";
import { appCallback, devices, mobileEnabled } from "@/lib/devices";
import { returnToApp, type NativeFailure, type NativeFlow } from "@/lib/devices/flow";
import { mobileConsoleEnabled, operatorDevices } from "@/lib/operator-devices";
import { publicOrigin } from "@/lib/public-api/instance";

/** How recent the provider's own sign-in must be for it to enrol a phone for the console. */
const FRESH_SECONDS = 300;

interface Flow {
  state: string;
  codeVerifier: string;
  next: string;
  native?: NativeFlow;
}

/**
 * Completes sign-in: checks the state and exchanges the code. A browser gets the sealed session cookie. A
 * native app gets a one-time code at its own address, which it exchanges with its verifier for a device
 * session (POST /api/v1/auth/device), so no session ever passes through the browser. A sign-in for the
 * console on a phone ends the same way, with a code for an operator device session
 * (POST /api/v1/auth/operator-device), and only for an operator who signed in at the provider just now.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const origin = await publicOrigin(request);
  const code = params.get("code");
  const flow = unseal<Flow>(request.cookies.get(FLOW_COOKIE)?.value ?? "", sessionSecret());
  const callback = flow?.native ? await appCallback(flow.native.platform) : null;
  const finish = (response: NextResponse) => {
    response.cookies.delete(FLOW_COOKIE);
    return response;
  };

  if (flow?.native && !callback) return finish(new NextResponse("This instance no longer has an app for that platform.", { status: 400 }));
  const fail = (reason: Exclude<NativeFailure, "method">) =>
    finish(flow?.native && callback ? returnToApp(callback, { error: reason, state: flow.native.state }) : NextResponse.redirect(new URL(`/sign-in?error=${reason === "expired" ? "expired" : "failed"}`, origin)));

  if (!code || !flow || flow.state !== params.get("state")) return fail("expired");
  const redirectUri = new URL("/auth/callback", origin).toString();
  let identity;
  let authenticatedAt;
  try {
    ({ identity, authenticatedAt } = await (await authProvider()).exchange({ code, redirectUri, codeVerifier: flow.codeVerifier }));
  } catch {
    return fail("failed");
  }

  if (flow.native?.purpose === "operator" && callback) {
    if (!await mobileConsoleEnabled()) return fail("mobile_console_off");
    // A session the provider already had for this browser doesn't enrol a phone: the sign-in must be new.
    if (authenticatedAt === null || Math.abs(Date.now() / 1000 - authenticatedAt) > FRESH_SECONDS) return fail("not_fresh");
    // Null for anyone the provider doesn't mark as an operator: no code, so no session.
    const handoff = await operatorDevices().issueCode({ identity, challenge: flow.native.challenge, platform: flow.native.platform });
    if (!handoff) return fail("not_operator");
    return finish(returnToApp(callback, { code: handoff, state: flow.native.state, purpose: "operator" }));
  }

  if (flow.native && callback) {
    if (!await mobileEnabled()) return fail("mobile_off");
    const { builderKey } = createSession(identity);
    const handoff = await devices().issueCode({
      // A device session never does operator work, whoever signs in. It records the role only so the app knows
      // whether to offer the console, which has its own session, key and biometric check.
      identity,
      builderKey: builderKey ? seal(builderKey, sessionSecret()) : null,
      challenge: flow.native.challenge,
      platform: flow.native.platform,
    });
    return finish(returnToApp(callback, { code: handoff, state: flow.native.state }));
  }

  const destination = identity.role === "operator" || !flow.next.startsWith("/operator") ? flow.next : "/";
  const response = NextResponse.redirect(new URL(destination, origin));
  response.cookies.set(SESSION_COOKIE, seal(createSession(identity), sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 3600,
  });
  return finish(response);
}

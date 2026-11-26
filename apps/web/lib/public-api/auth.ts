import "server-only";

import { timingSafeEqual } from "node:crypto";

import { operatorCan, quoteCredits, type ApiClient, type OperatorClient, type OperatorRole } from "@livepeer/api-client";
import type { NextRequest } from "next/server";

import { alerts } from "../alerts";
import { apiFor, workspaceOf } from "../api";
import { SESSION_COOKIE, current, readSessionValue } from "../auth/session";
import { devices, mobileEnabled } from "../devices";
import { DEVICE_TOKEN_PREFIX } from "../devices/sessions";
import { env } from "../env";
import { buildOperatorClient, buildReaderClient, operatorRoleOf } from "../operator/client";
import { operators } from "../operators";
import { moderation } from "../moderation";
import { mobileConsoleEnabled, operatorAudit, operatorDevices } from "../operator-devices";
import { OPERATOR_DEVICE_TOKEN_PREFIX } from "../operator-devices/sessions";
import type { OperatorDeviceRecord } from "../operator-devices/store";
import { describeInstance, requestOrigin } from "./instance";
import { agentModelMenu, capabilityLabels, privacyDescription, studioMediums } from "./labels";
import { ApiError, type Account, type Context, type Via } from "./operations";

export interface Caller {
  via: Via;
  client: ApiClient;
  operator: OperatorClient | null;
  /** The caller's role on the team that runs the instance. Null with `operator`. */
  operatorRole: OperatorRole | null;
  account: Account | null;
  /** The operator device session, when the console on a phone is calling. */
  operatorDevice: OperatorDeviceRecord | null;
}

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A viewer's client holds no admin token: it reads, and could change nothing even if asked. */
const clientFor = (role: OperatorRole): Promise<OperatorClient> => (role === "viewer" ? buildReaderClient() : buildOperatorClient());

/** Answers for a guest: the instance's default account, with no one signed in. */
export async function guest(): Promise<Caller> {
  return { via: "guest", client: await apiFor(null), operator: null, operatorRole: null, account: null, operatorDevice: null };
}

/**
 * Who is calling the instance API. Accepted, in order: the operator API token (administers the instance),
 * an operator device session from the console on a phone, a device session from the native apps, a user's
 * API key, or a signed-in browser session. Returns null when none is valid. A device session while the
 * instance serves no apps is refused with `mobile_off`, and an operator device session while it doesn't
 * offer the console on phones with `mobile_console_off`, so an installed app can say why.
 *
 * An operator device session gets the operator client here, but nothing runs for it except through
 * `runOperation`, which holds it to the operations marked for phones, an unlock and a proof per change.
 */
export async function authenticate(request: NextRequest): Promise<Caller | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";

  if (token) {
    const operatorToken = env("OPERATOR_API_TOKEN");
    if (operatorToken && same(token, operatorToken)) {
      // The instance's own token administers it: an owner's reach.
      return { via: "operator_token", client: await apiFor(null), operator: await buildOperatorClient(), operatorRole: "owner", account: null, operatorDevice: null };
    }
    if (token.startsWith(OPERATOR_DEVICE_TOKEN_PREFIX)) {
      if (!await mobileConsoleEnabled()) throw new ApiError(403, "This service doesn't offer its console on phones.", "mobile_console_off");
      const session = await operatorDevices().find(token);
      if (!session) return null;
      // The phone's person must still be on the team, and gets the role they have now.
      const role = await operators().role(session.userId);
      if (!role) {
        await operatorDevices().revokeUser(session.userId, "operator role removed");
        return null;
      }
      const user = { id: session.userId, name: session.name, email: session.email };
      return { via: "operator_device", client: await apiFor(user), operator: await clientFor(role), operatorRole: role, account: { user, role: "operator", deviceId: null }, operatorDevice: session };
    }
    if (token.startsWith(DEVICE_TOKEN_PREFIX)) {
      if (!await mobileEnabled()) throw new ApiError(403, "This service doesn't offer its app on phones right now.", "mobile_off");
      const device = await devices().find(token);
      if (!device) return null;
      const user = { id: device.userId, name: device.name, email: device.email };
      // The app works in the account the device session names, if the person still belongs to it.
      const workspaceId = await workspaceOf({ userId: device.userId, workspaceId: device.workspaceId ?? null });
      // Always `operator: null`, whatever the role: a user's device session never does operator work.
      return { via: "device", client: await apiFor(user, "offered", workspaceId), operator: null, operatorRole: null, account: { user, role: device.role ?? "user", deviceId: device.id }, operatorDevice: null };
    }
    const key = (await (await apiFor(null)).verifyApiKey(token)).data;
    if (!key) return null;
    // A workspace's key works in that workspace: its credit, its library.
    return { via: "api_key", client: await apiFor(null, "offered", key.workspace_id, key.workspace_id !== null), operator: null, operatorRole: null, account: null, operatorDevice: null };
  }

  const session = await current(readSessionValue(request.cookies.get(SESSION_COOKIE)?.value));
  if (!session) return null;
  const user = { id: session.userId, name: session.name, email: session.email };
  const role = await operatorRoleOf(session);
  return {
    via: "browser",
    // As the web's own pages do: the account the session is working in.
    client: await apiFor(user, "offered", await workspaceOf(session)),
    operator: role ? await clientFor(role) : null,
    operatorRole: role,
    account: { user, role: session.role, deviceId: null },
    operatorDevice: null,
  };
}

/** Whether a request carries a device session of either kind, so the API can serve it while the API surface itself is off. */
export function carriesDeviceToken(request: NextRequest): boolean {
  const token = (request.headers.get("authorization") ?? "").slice(7).trim();
  return token.startsWith(DEVICE_TOKEN_PREFIX) || token.startsWith(OPERATOR_DEVICE_TOKEN_PREFIX);
}

/** Everything an operation is given besides its caller, built once per request. */
export async function requestContext(request: NextRequest, caller: Caller): Promise<Context> {
  return { ...caller, can: (action) => caller.operatorRole !== null && operatorCan(caller.operatorRole, action), devices: devices(), operatorDevices: operatorDevices(), audit: operatorAudit(), alerts: alerts(), moderation: moderation(), instance: await describeInstance(requestOrigin(request)), labels: capabilityLabels, agentModelMenu, studioMediums, privacy: privacyDescription, quote: quoteCredits };
}

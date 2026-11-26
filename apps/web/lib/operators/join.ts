"use server";

import { redirect } from "next/navigation";

import { isFresh } from "../auth/fresh";
import { getSession, writeSession } from "../auth/session";
import { operatorAudit } from "../operator-devices";
import { operators } from "./index";

/**
 * Accepts an invitation to the team for whoever is signed in, and opens the console. The account that
 * accepts is the one that joins: nothing is matched by email. It asks for a recent sign-in, so a session
 * left open somewhere can't use a link that was passed on. Answers only when nobody joined.
 */
export async function acceptOperatorInvitationAction(token: string): Promise<{ error: string }> {
  const session = await getSession();
  if (!session) return { error: "Sign in to join the team." };
  if (!isFresh(session.authenticatedAt)) return { error: "Sign in again to join: joining asks for a sign-in from the last five minutes." };
  const joined = await operators().accept(token, { userId: session.userId, name: session.name, email: session.email });
  if (!joined) return { error: "This invitation can no longer be used. Ask for a new link." };
  await operatorAudit().write("change", { userId: session.userId, name: session.name, deviceId: null, deviceName: null }, { operation: "accept_operator_invitation", target: joined.invitationId, detail: joined.role });
  // Someone the identity provider already vouches for stays on its word; everyone else is on the team's.
  await writeSession({ ...session, role: "operator", operatorSource: session.operatorSource ?? "grant" });
  redirect("/operator");
}

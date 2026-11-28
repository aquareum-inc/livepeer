"use server";

import { redirect } from "next/navigation";

import { getSession, writeSession } from "../auth/session";
import { operatorAudit } from "../operator-devices";
import { firstOwnerOpen } from "./first-owner";
import { operators } from "./index";

/**
 * Makes whoever is signed in the owner of an instance nobody runs yet, and opens the console. Answers only
 * when it didn't happen.
 */
export async function claimInstanceAction(): Promise<{ error: string }> {
  const session = await getSession();
  if (!session) return { error: "Sign in to set up this instance." };
  const taken = { error: "This instance already has an owner. Ask them for an invitation to the team." };
  if (!(await firstOwnerOpen())) return taken;
  const owner = await operators().claim({ userId: session.userId, name: session.name, email: session.email });
  if (!owner) return taken;
  await operatorAudit().write("change", { userId: session.userId, name: session.name, deviceId: null, deviceName: null }, { operation: "claim_instance", target: null, detail: owner.role });
  await writeSession({ ...session, role: "operator", operatorSource: "grant" });
  redirect("/operator");
}

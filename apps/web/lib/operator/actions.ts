"use server";

import type { AccessKey, BillingSettings, CharacterReport, CapabilitySetting, CreditPack, EngineJob, Grant, OperatorPhone, Payment, Plan, TopUpRange } from "@livepeer/api-client";
import { EngineError } from "@livepeer/api-client";
import type { InstanceSettings } from "@livepeer/operator-console";
import { revalidatePath } from "next/cache";

import { getSession } from "../auth/session";
import { devices } from "../devices";
import { moderation } from "../moderation";
import { operatorDevices } from "../operator-devices";
import { operatorApi, requireOperator } from "./client";
import { saveSettings } from "./settings";

const usd = (amount: number) => ({ amount: amount.toFixed(2), currency: "USD" });

/** Turns an engine refusal into something an operator can act on. */
function explain(error: unknown): string {
  if (error instanceof EngineError && (error.status === 401 || error.status === 403)) {
    return "The engine refused this with the configured admin token. ENGINE_ADMIN_TOKEN must be an admin key; see System.";
  }
  return error instanceof Error && error.message ? error.message : "That didn't go through. Nothing was changed.";
}

export async function retryJobAction(id: string): Promise<EngineJob | null> {
  return (await (await operatorApi()).retryJob(id)).data;
}

export async function setUserStatusAction(applicationId: string, actorId: string, status: "active" | "paused"): Promise<void> {
  try {
    await (await operatorApi()).setActorStatus(applicationId, actorId, status);
  } catch (error) {
    throw new Error(explain(error));
  }
  // A suspended user's apps sign out on their next request, and so does the console on any phone of theirs.
  if (status === "paused") {
    devices().revokeAll(actorId);
    operatorDevices().revokeUser(actorId, "suspended");
  }
  revalidatePath("/operator/users", "layout");
}

export async function setUserRoleAction(userId: string, role: "user" | "operator"): Promise<void> {
  await (await operatorApi()).provider.identity.setUserRole(userId, role);
  // The role is read when a phone signs in, so taking it away ends the console sessions it opened.
  if (role === "user") operatorDevices().revokeUser(userId, "operator role removed");
  revalidatePath("/operator/users", "layout");
}

export async function assignPlanAction(userId: string, planId: string | null): Promise<void> {
  await (await operatorApi()).provider.plans.assignPlan(userId, planId);
  revalidatePath("/operator/users", "layout");
}

export async function topUpUserAction(userId: string, amountUsd: number): Promise<void> {
  try {
    await (await operatorApi()).provider.budgets.topUpAllocation(userId, usd(amountUsd));
  } catch (error) {
    throw new Error(explain(error));
  }
  revalidatePath("/operator/users", "layout");
}

export async function savePlanAction(id: string | null, input: Omit<Plan, "id">): Promise<Plan> {
  const { plans } = (await operatorApi()).provider;
  return id ? plans.updatePlan(id, input) : plans.createPlan(input);
}

export async function saveCreditPackAction(id: string | null, input: Omit<CreditPack, "id">): Promise<{ ok: true; packs: CreditPack[] } | { ok: false; error: string }> {
  try {
    const { plans } = (await operatorApi()).provider;
    await (id ? plans.updateCreditPack(id, input) : plans.createCreditPack(input));
    // Highlighting one pack takes the highlight off the others, so the whole list comes back.
    return { ok: true, packs: await plans.listCreditPacks() };
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}

export async function saveTopUpRangeAction(range: TopUpRange): Promise<{ ok: true; range: TopUpRange } | { ok: false; error: string }> {
  try {
    return { ok: true, range: await (await operatorApi()).provider.plans.updateTopUpRange(range) };
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}

export async function updateBillingAction(patch: Partial<BillingSettings>): Promise<BillingSettings> {
  return (await (await operatorApi()).updateBillingSettings(patch)).data;
}

export async function refundPaymentAction(id: string): Promise<Payment | null> {
  return (await (await operatorApi()).refundPayment(id)).data;
}

export async function createGrantAction(input: { label: string; amountUsd: number }): Promise<Grant> {
  try {
    return await (await operatorApi()).provider.budgets.createGrant({ label: input.label, amount: usd(input.amountUsd) });
  } catch (error) {
    throw new Error(explain(error));
  }
}

export async function fundGrantAction(id: string, amountUsd: number): Promise<Grant> {
  try {
    return await (await operatorApi()).provider.budgets.fundGrant(id, usd(amountUsd));
  } catch (error) {
    throw new Error(explain(error));
  }
}

export async function updateCapabilityAction(app: string, patch: Partial<Omit<CapabilitySetting, "app">>): Promise<CapabilitySetting> {
  return (await (await operatorApi()).updateCapabilitySetting(app, patch)).data;
}

export async function setOperatorBlockedAction(orchestratorUrl: string, blocked: boolean): Promise<boolean> {
  return (await (await operatorApi()).setComputeOperatorBlocked(orchestratorUrl, blocked)).data;
}

export async function saveInstanceSettingsAction(settings: InstanceSettings): Promise<{ ok: true } | { ok: false; error: string }> {
  await operatorApi();
  const result = saveSettings(settings);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function issueKeyAction(input: { actor_id: string; label: string; kind: AccessKey["kind"] }): Promise<{ key: AccessKey; token: string | null } | { error: string }> {
  try {
    return (await (await operatorApi()).issueAccessKey(input)).data;
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function revokeKeyAction(keyId: string): Promise<AccessKey | null> {
  return (await (await operatorApi()).revokeAccessKey(keyId)).data;
}

/** The operator's decision on a report; answers with every report, as the queue shows them. */
export async function resolveReportAction(id: string, outcome: "dismissed" | "hidden"): Promise<CharacterReport[]> {
  await requireOperator();
  moderation().resolve(id, outcome);
  return moderation().reports();
}

/** The signed-in operator, as the audit log names whoever revokes a phone. */
async function revoker() {
  const session = await getSession();
  if (session?.role !== "operator") throw new Error("Operator role required");
  return { userId: session.userId, name: session.name, deviceId: null, deviceName: null };
}

/** Revokes one operator phone; answers with the phones still enrolled. */
export async function revokeOperatorPhoneAction(id: string): Promise<OperatorPhone[]> {
  operatorDevices().revoke(id, await revoker());
  revalidatePath("/operator", "layout");
  return operatorDevices().list();
}

/** Revokes every operator phone; answers with the phones still enrolled. */
export async function revokeAllOperatorPhonesAction(): Promise<OperatorPhone[]> {
  operatorDevices().revokeAll(await revoker());
  revalidatePath("/operator", "layout");
  return operatorDevices().list();
}

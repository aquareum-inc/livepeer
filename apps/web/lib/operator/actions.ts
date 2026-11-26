"use server";

import type { AccessKey, BillingSettings, CharacterReport, CapabilitySetting, CreditPack, EngineJob, Grant, OperatorPhone, Payment, Plan, TopUpRange } from "@livepeer/api-client";
import { EngineError } from "@livepeer/api-client";
import type { CapabilityRow, InstanceSettings } from "@livepeer/operator-console";
import { revalidatePath } from "next/cache";

import type { Session } from "../auth/types";
import { devices } from "../devices";
import { moderation } from "../moderation";
import { operatorDevices } from "../operator-devices";
import { capabilityRows } from "./capability-rows";
import { operatorApi, requireOperator } from "./client";
import { currentSettings, resetSettings, saveSettings } from "./settings";

const usd = (amount: number) => ({ amount: amount.toFixed(2), currency: "USD" });

/** Turns an engine refusal into something an operator can act on. */
function explain(error: unknown): string {
  if (error instanceof EngineError && (error.status === 401 || error.status === 403)) {
    return "The engine refused this with the configured admin token. ENGINE_ADMIN_TOKEN must be an admin key; see System.";
  }
  return error instanceof Error && error.message ? error.message : "That didn't go through. Nothing was changed.";
}

export async function retryJobAction(id: string): Promise<EngineJob | null> {
  return (await (await operatorApi("retry_job")).retryJob(id)).data;
}

export async function setUserStatusAction(applicationId: string, actorId: string, status: "active" | "paused"): Promise<void> {
  try {
    await (await operatorApi("suspend_account")).setActorStatus(applicationId, actorId, status);
  } catch (error) {
    throw new Error(explain(error));
  }
  // A suspended user's apps sign out on their next request, and so does the console on any phone of theirs.
  if (status === "paused") {
    await devices().revokeAll(actorId);
    await operatorDevices().revokeUser(actorId, "suspended");
  }
  revalidatePath("/operator/users", "layout");
}

export async function setUserRoleAction(userId: string, role: "user" | "operator"): Promise<void> {
  await (await operatorApi("manage_team")).provider.identity.setUserRole(userId, role);
  // The role is read when a phone signs in, so taking it away ends the console sessions it opened.
  if (role === "user") await operatorDevices().revokeUser(userId, "operator role removed");
  revalidatePath("/operator/users", "layout");
}

export async function assignPlanAction(userId: string, planId: string | null): Promise<void> {
  await (await operatorApi("adjust_account")).provider.plans.assignPlan(userId, planId);
  revalidatePath("/operator/users", "layout");
}

export async function topUpUserAction(userId: string, amountUsd: number): Promise<void> {
  try {
    await (await operatorApi("adjust_account")).provider.budgets.topUpAllocation(userId, usd(amountUsd));
  } catch (error) {
    throw new Error(explain(error));
  }
  revalidatePath("/operator/users", "layout");
}

/** Suspends or resumes a workspace. Its members stay signed in and keep their own accounts. */
export async function setWorkspaceStatusAction(workspaceId: string, status: "active" | "paused"): Promise<void> {
  try {
    await (await operatorApi("suspend_account")).setWorkspaceStatus(workspaceId, status);
  } catch (error) {
    throw new Error(explain(error));
  }
  revalidatePath("/operator/workspaces", "layout");
}

/** A workspace is an account like a person's: its plan is assigned the same way. */
export async function assignWorkspacePlanAction(workspaceId: string, planId: string | null): Promise<void> {
  await (await operatorApi("adjust_account")).provider.plans.assignPlan(workspaceId, planId);
  revalidatePath("/operator/workspaces", "layout");
}

export async function topUpWorkspaceAction(workspaceId: string, amountUsd: number): Promise<void> {
  try {
    await (await operatorApi("adjust_account")).provider.budgets.topUpAllocation(workspaceId, usd(amountUsd));
  } catch (error) {
    throw new Error(explain(error));
  }
  revalidatePath("/operator/workspaces", "layout");
}

export async function savePlanAction(id: string | null, input: Omit<Plan, "id">): Promise<Plan> {
  const { plans } = (await operatorApi("set_pricing")).provider;
  return id ? plans.updatePlan(id, input) : plans.createPlan(input);
}

export async function saveCreditPackAction(id: string | null, input: Omit<CreditPack, "id">): Promise<{ ok: true; packs: CreditPack[] } | { ok: false; error: string }> {
  try {
    const { plans } = (await operatorApi("set_pricing")).provider;
    await (id ? plans.updateCreditPack(id, input) : plans.createCreditPack(input));
    // Highlighting one pack takes the highlight off the others, so the whole list comes back.
    return { ok: true, packs: await plans.listCreditPacks() };
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}

export async function saveTopUpRangeAction(range: TopUpRange): Promise<{ ok: true; range: TopUpRange } | { ok: false; error: string }> {
  try {
    return { ok: true, range: await (await operatorApi("set_pricing")).provider.plans.updateTopUpRange(range) };
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}

export async function updateBillingAction(patch: Partial<BillingSettings>): Promise<BillingSettings> {
  return (await (await operatorApi("set_pricing")).updateBillingSettings(patch)).data;
}

export async function refundPaymentAction(id: string): Promise<Payment | null> {
  return (await (await operatorApi("adjust_account")).refundPayment(id)).data;
}

export async function createGrantAction(input: { label: string; amountUsd: number }): Promise<Grant> {
  try {
    return await (await operatorApi("manage_grants")).provider.budgets.createGrant({ label: input.label, amount: usd(input.amountUsd) });
  } catch (error) {
    throw new Error(explain(error));
  }
}

export async function fundGrantAction(id: string, amountUsd: number): Promise<Grant> {
  try {
    return await (await operatorApi("manage_grants")).provider.budgets.fundGrant(id, usd(amountUsd));
  } catch (error) {
    throw new Error(explain(error));
  }
}

/** Switching a capability on or off is a member's to do; its markup and where it appears are pricing, an owner's. */
export async function updateCapabilityAction(app: string, patch: Partial<Omit<CapabilitySetting, "app">>): Promise<CapabilitySetting> {
  const onlySwitches = Object.keys(patch).every((key) => key === "enabled");
  return (await (await operatorApi(onlySwitches ? "switch_capability" : "set_pricing")).updateCapabilitySetting(app, patch)).data;
}

export async function setOperatorBlockedAction(orchestratorUrl: string, blocked: boolean): Promise<boolean> {
  return (await (await operatorApi("block_compute")).setComputeOperatorBlocked(orchestratorUrl, blocked)).data;
}

export async function saveInstanceSettingsAction(settings: InstanceSettings): Promise<{ ok: true } | { ok: false; error: string }> {
  await operatorApi("change_settings");
  const result = await saveSettings(settings);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Forgets what the Settings page saved, and answers with the settings the instance was deployed with. */
export async function resetInstanceSettingsAction(): Promise<InstanceSettings> {
  await operatorApi("change_settings");
  await resetSettings("settings");
  revalidatePath("/", "layout");
  return (await currentSettings()).settings;
}

/** Puts every capability back as the instance was deployed with it, and answers with the page's rows as they then are. */
export async function resetCapabilitiesAction(): Promise<CapabilityRow[]> {
  await (await operatorApi("set_pricing")).resetCapabilitySettings();
  revalidatePath("/", "layout");
  // A new client: it reads the config as it is now, where the one that reset still holds what it started with.
  return (await capabilityRows(await operatorApi("set_pricing"))).rows;
}

export async function issueKeyAction(input: { actor_id: string; label: string; kind: AccessKey["kind"] }): Promise<{ key: AccessKey; token: string | null } | { error: string }> {
  try {
    return (await (await operatorApi("manage_keys")).issueAccessKey(input)).data;
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function revokeKeyAction(keyId: string): Promise<AccessKey | null> {
  return (await (await operatorApi("manage_keys")).revokeAccessKey(keyId)).data;
}

/** The operator's decision on a report; answers with every report, as the queue shows them. */
export async function resolveReportAction(id: string, outcome: "dismissed" | "hidden"): Promise<CharacterReport[]> {
  await requireOperator("resolve_report");
  await moderation().resolve(id, outcome);
  return moderation().reports();
}

/** The signed-in operator, as the audit log names whoever did something from the web console. */
const actorOf = (session: Session) => ({ userId: session.userId, name: session.name, deviceId: null, deviceName: null });

/** Revokes one operator phone: anyone their own, an owner anyone's. Answers with the phones still enrolled. */
export async function revokeOperatorPhoneAction(id: string): Promise<OperatorPhone[]> {
  const { session } = await requireOperator();
  const phone = (await operatorDevices().list()).find((entry) => entry.id === id);
  if (phone && phone.user_id !== session.userId) await requireOperator("manage_team");
  await operatorDevices().revoke(id, actorOf(session));
  revalidatePath("/operator", "layout");
  return operatorDevices().list();
}

/** Revokes every operator phone; answers with the phones still enrolled. */
export async function revokeAllOperatorPhonesAction(): Promise<OperatorPhone[]> {
  const { session } = await requireOperator("manage_team");
  await operatorDevices().revokeAll(actorOf(session));
  revalidatePath("/operator", "layout");
  return operatorDevices().list();
}

/**
 * Closes the notice that these phones were added, for the operator who asked and nobody else. The phones stay
 * marked on System until they are two days old.
 */
/** The operator has System open, where new phones are listed and tagged: its dot has done its job. Their own, so any role. */
export async function seeNewPhonesAction(): Promise<void> {
  const { session } = await requireOperator();
  await operatorDevices().seeNewPhones(session.userId);
  revalidatePath("/operator", "layout");
}

/** Closes the notice for the operator who asked. Their own, so any role. */
export async function dismissNewPhonesAction(phoneIds: string[]): Promise<void> {
  const { session } = await requireOperator();
  const ids = Array.isArray(phoneIds) ? phoneIds.filter((id): id is string => typeof id === "string").slice(0, 100) : [];
  await operatorDevices().dismissNewPhones(session.userId, ids);
  revalidatePath("/operator", "layout");
}

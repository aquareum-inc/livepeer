"use server";

import type {
  ApiKey,
  CapabilityRun,
  Character,
  CharacterBlock,
  CharacterCall,
  CharacterInput,
  CharacterReport,
  Conversation,
  CreatedApiKey,
  CreditBalance,
  Generation,
  GenerationRequest,
  LiveDestination,
  LiveDestinationInput,
  LiveHealth,
  LiveLook,
  LiveSession,
  LiveSessionInput,
  MediaItem,
  MediaKind,
  Money,
  Plan,
  Preferences,
  ReportReason,
  SendMessageInput,
  UploadRequest,
  UploadTicket,
  VideoAnalysis,
  WorkspaceInvitation,
  WorkspaceRole,
} from "@livepeer/api-client";
import { UploadRefused } from "@livepeer/api-client";
import type { Outcome } from "@livepeer/user-app";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { api } from "./api";
import { clearSession, getSession, writeSession } from "./auth/session";
import { adultContent, charactersEnabled } from "./content";
import { devices } from "./devices";
import { moderation } from "./moderation";

/** Every action is a signed-in user's call to one API client function. A guest is sent to sign in. */
async function client() {
  if (!(await getSession())) redirect("/sign-in");
  return await api();
}

export async function createGenerationAction(request: GenerationRequest): Promise<Generation> {
  return (await (await client()).createGeneration(request)).data;
}

export async function getGenerationAction(id: string): Promise<Generation | null> {
  return (await (await client()).getGeneration(id)).data;
}

/**
 * Checks a file before the browser sends it. A refusal comes back as words to show, not as a thrown error,
 * since a thrown error's message doesn't reach the browser in production.
 */
export async function requestUploadAction(request: UploadRequest): Promise<{ ticket: UploadTicket } | { refused: string }> {
  try {
    return { ticket: (await (await client()).requestUpload(request)).data };
  } catch (cause) {
    if (cause instanceof UploadRefused) return { refused: cause.message };
    throw cause;
  }
}

export async function createConversationAction(input: SendMessageInput): Promise<Conversation> {
  const { data } = await (await client()).createConversation(input);
  revalidatePath("/", "layout");
  return data;
}

export async function getConversationAction(id: string): Promise<Conversation | null> {
  return (await (await client()).getConversation(id)).data;
}

export async function sendMessageAction(id: string, input: SendMessageInput): Promise<Conversation | null> {
  return (await (await client()).sendMessage(id, input)).data;
}

export async function searchMediaAction(filter: { query: string; kind?: MediaKind }): Promise<MediaItem[]> {
  return (await (await client()).listMedia(filter)).data;
}

export async function deleteMediaAction(id: string): Promise<boolean> {
  return (await (await client()).deleteMedia(id)).data;
}

export async function createCharacterAction(input: CharacterInput): Promise<Character> {
  const { data } = await (await client()).createCharacter(input);
  revalidatePath("/characters");
  return data;
}

/** A shared character someone else made: what can be reported or blocked. */
async function sharedCharacter(slug: string): Promise<{ userId: string; character: Character }> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const character = (await (await api()).getCharacter(slug)).data;
  if (!character || character.mine || !(await moderation().visible(session.userId))(character)) throw new Error("Character not found");
  return { userId: session.userId, character };
}

/** Sends a report of a shared character to the instance's operator (`report_character`). */
export async function reportCharacterAction(slug: string, reason: ReportReason, note: string | null): Promise<CharacterReport> {
  const { userId, character } = await sharedCharacter(slug);
  return moderation().report(userId, character, reason, note?.trim().slice(0, 500) || null);
}

/** Hides a shared character and everything by its author from the person (`block_character`). */
export async function blockCharacterAction(slug: string): Promise<CharacterBlock> {
  const { userId, character } = await sharedCharacter(slug);
  const blocked = await moderation().block(userId, character);
  revalidatePath("/characters");
  return blocked;
}

/** Deletes the signed-in person's account (`delete_account`): their phones are signed out, their blocks forgotten. */
export async function deleteAccountAction(): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  await (await api()).deleteAccount();
  await devices().revokeAll(session.userId);
  await moderation().forget(session.userId);
  await clearSession();
  redirect("/");
}

/** Signs one of the person's phones or tablets out (`revoke_device`). */
export async function revokeDeviceAction(id: string): Promise<boolean> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return devices().revoke(session.userId, id);
}

export async function createApiKeyAction(label: string): Promise<CreatedApiKey> {
  return (await (await client()).createApiKey(label)).data;
}

export async function revokeApiKeyAction(id: string): Promise<ApiKey | null> {
  return (await (await client()).revokeApiKey(id)).data;
}

export async function runCapabilityAction(app: string, request: unknown): Promise<CapabilityRun> {
  return (await (await client()).runCapability(app, request)).data;
}

export async function updatePreferencesAction(patch: Partial<Preferences>): Promise<Preferences> {
  return (await (await client()).updatePreferences(patch)).data;
}

export async function buyCreditPackAction(packId: string): Promise<CreditBalance> {
  return (await (await client()).buyCreditPack(packId)).data;
}

export async function buyCreditsAction(amount: Money): Promise<CreditBalance> {
  return (await (await client()).buyCredits(amount)).data;
}

export async function changePlanAction(planId: string | null): Promise<Plan | null> {
  return (await (await client()).changePlan(planId)).data;
}

export async function listMediaAction(): Promise<MediaItem[]> {
  return (await (await client()).listMedia()).data;
}

/** The characters a user can put in a video: their own first, then public ones, mature only if shown. */
export async function listCastableCharactersAction(): Promise<Character[]> {
  const api = await client();
  if (!charactersEnabled()) return [];
  const { shown } = await adultContent(api);
  const [mine, shared] = await Promise.all([
    api.listCharacters({ scope: "mine", includeMature: shown }),
    api.listCharacters({ scope: "public", includeMature: shown }),
  ]);
  const own = new Set(mine.data.map((entry) => entry.slug));
  const visible = await moderation().visible((await getSession())?.userId ?? null);
  return [...mine.data, ...shared.data.filter((entry) => !own.has(entry.slug))].filter(visible);
}

export async function analyseVideoAction(input: { source: string; question: string }): Promise<VideoAnalysis> {
  return (await (await client()).analyseVideo(input)).data;
}

export async function saveLiveLookAction(input: { name: string; prompt: string }): Promise<LiveLook> {
  return (await (await client()).saveLiveLook(input)).data;
}

export async function addLiveDestinationAction(input: LiveDestinationInput): Promise<LiveDestination> {
  return (await (await client()).addLiveDestination(input)).data;
}

export async function removeLiveDestinationAction(id: string): Promise<boolean> {
  return (await (await client()).removeLiveDestination(id)).data;
}

export async function startLiveSessionAction(input: LiveSessionInput): Promise<LiveSession> {
  return (await (await client()).startLiveSession(input)).data;
}

export async function updateLiveSessionAction(id: string, prompt: string): Promise<LiveSession | null> {
  return (await (await client()).updateLiveSession(id, prompt)).data;
}

export async function stopLiveSessionAction(id: string): Promise<LiveSession | null> {
  return (await (await client()).stopLiveSession(id)).data;
}

export async function getLiveHealthAction(id: string): Promise<LiveHealth | null> {
  return (await (await client()).getLiveHealth(id)).data;
}

export async function startPlaygroundSessionAction(prompt: string): Promise<LiveSession> {
  return (await (await client()).startLiveSession({ app: "live-video-to-video", source: "camera", prompt, destination_ids: [], record: false })).data;
}

export async function startCallAction(slug: string, mode: CharacterCall["mode"]): Promise<CharacterCall> {
  return (await (await client()).startCall(slug, mode)).data;
}

export async function endCallAction(id: string): Promise<CharacterCall | null> {
  return (await (await client()).endCall(id)).data;
}

/**
 * Workspace actions answer with an `Outcome`: a refusal comes back as words to show, not as a thrown error,
 * since a thrown error's message doesn't reach the browser in production.
 */
async function outcome<T>(run: (api: Awaited<ReturnType<typeof client>>) => Promise<T>): Promise<Outcome<T>> {
  const api = await client();
  try {
    return { ok: true, data: await run(api) };
  } catch (cause) {
    // The API client and the provider refuse in sentences written for the person.
    return { ok: false, error: cause instanceof Error && cause.message ? cause.message : "That didn't work. Try again." };
  }
}

/** Points the session at an account the person belongs to. Null is their personal account. */
async function enter(workspaceId: string | null): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  await writeSession({ ...session, workspaceId });
  revalidatePath("/", "layout");
}

/** Switches the account the person is working in: their own, or a workspace they belong to (`listAccounts`). */
export async function switchAccountAction(accountId: string): Promise<void> {
  const api = await client();
  const { accounts } = (await api.listAccounts()).data;
  const target = accounts.find((entry) => entry.id === accountId);
  if (!target) throw new Error("You don't belong to that account.");
  await enter(target.kind === "workspace" ? target.id : null);
  redirect("/");
}

/** Creates a workspace and starts working in it. */
export async function createWorkspaceAction(name: string): Promise<Outcome> {
  const created = await outcome(async (api) => (await api.createWorkspace(name)).data);
  if (!created.ok) return created;
  await enter(created.data.id);
  redirect("/settings/workspace");
}

export async function renameWorkspaceAction(name: string): Promise<Outcome<string>> {
  const result = await outcome(async (api) => (await api.renameWorkspace(name)).data.name);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function inviteMemberAction(input: { email: string; role: Exclude<WorkspaceRole, "owner"> }): Promise<Outcome<WorkspaceInvitation>> {
  const result = await outcome(async (api) => (await api.inviteMember(input)).data);
  if (result.ok) revalidatePath("/settings/workspace");
  return result;
}

export async function revokeInvitationAction(invitationId: string): Promise<Outcome<boolean>> {
  const result = await outcome(async (api) => (await api.revokeInvitation(invitationId)).data);
  if (result.ok) revalidatePath("/settings/workspace");
  return result;
}

/** Joins the workspace an invitation is for and starts working in it. */
export async function acceptInvitationAction(token: string): Promise<Outcome> {
  const joined = await outcome(async (api) => (await api.acceptInvitation(token)).data);
  if (!joined.ok) return joined;
  await enter(joined.data.id);
  redirect("/settings/workspace");
}

export async function declineInvitationAction(token: string): Promise<Outcome<boolean>> {
  const result = await outcome(async (api) => (await api.declineInvitation(token)).data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function setMemberRoleAction(userId: string, role: Exclude<WorkspaceRole, "owner">): Promise<Outcome<WorkspaceRole>> {
  const result = await outcome(async (api) => (await api.setMemberRole(userId, role)).data.role);
  if (result.ok) revalidatePath("/settings/workspace");
  return result;
}

export async function removeMemberAction(userId: string): Promise<Outcome<boolean>> {
  const result = await outcome(async (api) => (await api.removeMember(userId)).data);
  if (result.ok) revalidatePath("/settings/workspace");
  return result;
}

/** Leaves the current workspace and goes back to the personal account. */
export async function leaveWorkspaceAction(): Promise<Outcome> {
  const left = await outcome(async (api) => (await api.leaveWorkspace()).data);
  if (!left.ok) return left;
  await enter(null);
  redirect("/");
}

export async function transferOwnershipAction(toUserId: string): Promise<Outcome<string>> {
  const result = await outcome(async (api) => (await api.transferOwnership(toUserId)).data.owner_id);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

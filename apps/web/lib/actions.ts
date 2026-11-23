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
} from "@livepeer/api-client";
import { UploadRefused } from "@livepeer/api-client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { api } from "./api";
import { clearSession, getSession } from "./auth/session";
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
  if (!character || character.mine || !moderation().visible(session.userId)(character)) throw new Error("Character not found");
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
  const blocked = moderation().block(userId, character);
  revalidatePath("/characters");
  return blocked;
}

/** Deletes the signed-in person's account (`delete_account`): their phones are signed out, their blocks forgotten. */
export async function deleteAccountAction(): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  await (await api()).deleteAccount();
  devices().revokeAll(session.userId);
  moderation().forget(session.userId);
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
  const visible = moderation().visible((await getSession())?.userId ?? null);
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

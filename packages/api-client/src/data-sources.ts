import type { DataSource } from "./types";

/**
 * The single map that decides, per function, whether the live engine or the mock answers.
 * Listed with endpoints and blockers in docs/data-sources.md. MOCK_ONLY=1 forces every entry to "mock".
 */
export const DATA_SOURCES = {
  listOfferings: "live",
  // Live when the engine is configured and an offering has a language app.
  listAgentModels: "live",
  getCreditBalance: "mock",
  listShowcase: "mock",
  listPromptStarters: "mock",
  createGeneration: "mock",
  getGeneration: "mock",
  // Live when a ConversationStore and an engine token are both provided.
  listConversations: "live",
  getConversation: "live",
  createConversation: "live",
  sendMessage: "live",
  deleteConversation: "live",
  runCapability: "mock",
  listMedia: "mock",
  deleteMedia: "mock",
  requestUpload: "mock",
  receiveUpload: "mock",
  readMediaFile: "mock",
  listCharacters: "mock",
  getCharacter: "mock",
  createCharacter: "mock",
  // Workspaces: mocked until the payment provider has shared accounts (docs/workspaces.md, Q18 to Q24).
  listAccounts: "mock",
  createWorkspace: "mock",
  getWorkspace: "mock",
  renameWorkspace: "mock",
  inviteMember: "mock",
  revokeInvitation: "mock",
  getInvitation: "mock",
  acceptInvitation: "mock",
  declineInvitation: "mock",
  setMemberRole: "mock",
  removeMember: "mock",
  leaveWorkspace: "mock",
  transferOwnership: "mock",
  getMemberUsage: "mock",
  getAccount: "mock",
  buyCreditPack: "mock",
  buyCredits: "mock",
  changePlan: "mock",
  getUsage: "mock",
  listApiKeys: "mock",
  createApiKey: "mock",
  revokeApiKey: "mock",
  verifyApiKey: "mock",
  getPreferences: "mock",
  deleteAccount: "mock",
  updatePreferences: "mock",
  analyseVideo: "mock",
  listLiveLooks: "mock",
  saveLiveLook: "mock",
  listLiveDestinations: "mock",
  addLiveDestination: "mock",
  removeLiveDestination: "mock",
  startLiveSession: "mock",
  updateLiveSession: "mock",
  stopLiveSession: "mock",
  getLiveHealth: "mock",
  startCall: "mock",
  endCall: "mock",
  listExampleApps: "mock",
} as const satisfies Record<string, DataSource>;

export type ApiFunctionName = keyof typeof DATA_SOURCES;

export function isMockOnly(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.MOCK_ONLY;
  return value === "1" || value === "true";
}

export function resolveSource(
  name: ApiFunctionName,
  env: Record<string, string | undefined> = process.env,
): DataSource {
  return isMockOnly(env) ? "mock" : DATA_SOURCES[name];
}

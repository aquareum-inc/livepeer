// Generated from docs/mobile/openapi.json by packages/mobile-codegen.
// Do not edit: change apps/web/lib/public-api/operations.ts or the API client's types and run `pnpm mobile:generate`.

import Foundation

/// One function per operation in the instance's API. The same list serves REST, MCP and the web interface.
struct API: Sendable {
    let transport: APITransport

    /// Describe this instance: its name, logo and theme, what it serves, how to sign in and its content settings.
    /// Open to guests.
    func getInstance() async throws -> InstanceDescription {
        try await transport.send("GET", "/instance", query: [:], body: nil)
    }

    /// Native apps: collect a finished sign-in with the one-time code from the sign-in callback and the PKCE verifier. Answers with a device session token, shown once.
    /// Open to guests.
    func createDeviceSession(code: String, verifier: String, platform: String, deviceName: String? = nil) async throws -> DeviceToken {
        try await transport.send("POST", "/auth/device", query: [:], body: ["code": .string(code), "verifier": .string(verifier), "platform": .string(platform), "device_name": deviceName.map { .string($0) }])
    }

    /// Native apps: sign this device out by ending the device session making the request.
    func endDeviceSession() async throws -> Deleted {
        try await transport.send("DELETE", "/auth/device", query: [:], body: nil)
    }

    /// The signed-in person: their name, email, credit balance and whether they run this instance.
    func getMe() async throws -> Me {
        try await transport.send("GET", "/me", query: [:], body: nil)
    }

    /// Delete the signed-in person's account, on their own request: their phones are signed out and their blocks forgotten. This can't be undone.
    func deleteAccount() async throws -> Deleted {
        try await transport.send("DELETE", "/me", query: [:], body: nil)
    }

    /// The accounts the person can work in (their own, and the workspaces they belong to, each with their role and its balance), which one is current, and invitations waiting, to answer with accept_invitation or decline_invitation.
    func listAccounts() async throws -> AccountList {
        try await transport.send("GET", "/accounts", query: [:], body: nil)
    }

    /// Join the workspace an invitation waiting for the person is for. A native app starts working in it at once. Answers with their accounts as they now stand.
    func acceptInvitation(id: String) async throws -> AccountList {
        try await transport.send("POST", "/invitations/\(APITransport.escape(id))/accept", query: [:], body: nil)
    }

    /// Decline an invitation waiting for the person. Answers with their accounts, the invitation gone.
    func declineInvitation(id: String) async throws -> AccountList {
        try await transport.send("POST", "/invitations/\(APITransport.escape(id))/decline", query: [:], body: nil)
    }

    /// From a native app: work in another of the person's accounts, their own or a workspace they belong to. Everything the app then reads and makes is that account's.
    func switchAccount(accountId: String) async throws -> AccountList {
        try await transport.send("POST", "/accounts/current", query: [:], body: ["account_id": .string(accountId)])
    }

    /// List the phones and tablets signed in to the person's account, most recently used first.
    func listDevices() async throws -> [DeviceSession] {
        try await transport.send("GET", "/devices", query: [:], body: nil)
    }

    /// Sign one of the person's devices out. The app on it returns to signed out on its next request.
    func revokeDevice(id: String) async throws -> Deleted {
        try await transport.send("DELETE", "/devices/\(APITransport.escape(id))", query: [:], body: nil)
    }

    /// List the starting points shown on Home, each with example requests.
    /// Open to guests.
    func listPromptStarters() async throws -> [PromptStarter] {
        try await transport.send("GET", "/starters", query: [:], body: nil)
    }

    /// List the examples in the instance's gallery, each with the request that made it.
    /// Open to guests.
    func listShowcase() async throws -> [ShowcaseItem] {
        try await transport.send("GET", "/showcase", query: [:], body: nil)
    }

    /// List the language models the agent can run on, for the model menu.
    /// Open to guests.
    func listAgentModels() async throws -> [AgentModel] {
        try await transport.send("GET", "/agent-models", query: [:], body: nil)
    }

    /// List the agent's model menu as the interface shows it: one row per language model, named and described, with the app to send as agent_model. Hidden when there are fewer than two rows.
    /// Open to guests.
    func listAgentModelMenu() async throws -> [AgentModelEntry] {
        try await transport.send("GET", "/agent-models/menu", query: [:], body: nil)
    }

    /// List the readable name of each capability on offer and each model the agent can run on, as the interface shows it, with the model that does the work when known.
    /// Open to guests.
    func listCapabilityLabels() async throws -> [CapabilityLabel] {
        try await transport.send("GET", "/offerings/labels", query: [:], body: nil)
    }

    /// List the capabilities discovered on the network that this instance offers.
    /// Open to guests.
    func listCapabilities() async throws -> [Offering] {
        try await transport.send("GET", "/offerings", query: [:], body: nil)
    }

    /// Run any discovered capability with a request body of your own.
    func runCapability(app: String, request: JSONValue? = nil) async throws -> CapabilityRun {
        try await transport.send("POST", "/run", query: [:], body: ["app": .string(app), "request": request.map { $0 }])
    }

    /// List the studio's mediums (video, image, audio) as the interface shows them: each one's modes, with the capability each mode runs and whether it is on offer, and its shapes, lengths and resolutions.
    /// Open to guests.
    func listStudioMediums() async throws -> [StudioMedium] {
        try await transport.send("GET", "/studio", query: [:], body: nil)
    }

    /// What one result of a generation would cost in credits, before starting it.
    /// Open to guests.
    func quoteGeneration(kind: String, app: String, durationSeconds: Double? = nil, resolution: String? = nil) async throws -> Quote {
        try await transport.send("GET", "/generations/quote", query: ["kind": .string(kind), "app": .string(app), "duration_seconds": durationSeconds.map { .number($0) }, "resolution": resolution.map { .string($0) }], body: nil)
    }

    /// Generate a video, image or audio clip. Returns a job to poll with get_generation.
    func createGeneration(kind: String, app: String, prompt: String, aspect: String? = nil, durationSeconds: Double? = nil, resolution: String? = nil, negativePrompt: String? = nil) async throws -> Generation {
        try await transport.send("POST", "/generations", query: [:], body: ["kind": .string(kind), "app": .string(app), "prompt": .string(prompt), "aspect": aspect.map { .string($0) }, "duration_seconds": durationSeconds.map { .number($0) }, "resolution": resolution.map { .string($0) }, "negative_prompt": negativePrompt.map { .string($0) }])
    }

    /// Check a generation's state and progress.
    func getGeneration(id: String) async throws -> Generation {
        try await transport.send("GET", "/generations/\(APITransport.escape(id))", query: [:], body: nil)
    }

    /// List the user's conversations with the agent, newest first.
    func listConversations() async throws -> [ConversationSummary] {
        try await transport.send("GET", "/conversations", query: [:], body: nil)
    }

    /// Start a conversation with the agent. It plans the job, calls capabilities and reports each step.
    func createConversation(text: String, app: String? = nil, aspect: String? = nil, durationSeconds: Double? = nil, attachmentIds: [String]? = nil, agentModel: String? = nil, characterSlug: String? = nil) async throws -> Conversation {
        try await transport.send("POST", "/conversations", query: [:], body: ["text": .string(text), "app": app.map { .string($0) }, "aspect": aspect.map { .string($0) }, "duration_seconds": durationSeconds.map { .number($0) }, "attachment_ids": attachmentIds.map { .array($0.map { .string($0) }) }, "agent_model": agentModel.map { .string($0) }, "character_slug": characterSlug.map { .string($0) }])
    }

    /// Read a conversation, including the agent's steps, results and any video analysis.
    func getConversation(id: String) async throws -> Conversation {
        try await transport.send("GET", "/conversations/\(APITransport.escape(id))", query: [:], body: nil)
    }

    /// Delete a conversation. Its shots stay in the library. This can't be undone.
    func deleteConversation(id: String) async throws -> Deleted {
        try await transport.send("DELETE", "/conversations/\(APITransport.escape(id))", query: [:], body: nil)
    }

    /// Send a follow-up message in a conversation.
    func sendMessage(id: String, text: String, app: String? = nil, aspect: String? = nil, durationSeconds: Double? = nil, attachmentIds: [String]? = nil, agentModel: String? = nil, characterSlug: String? = nil) async throws -> Conversation {
        try await transport.send("POST", "/conversations/\(APITransport.escape(id))/messages", query: [:], body: ["text": .string(text), "app": app.map { .string($0) }, "aspect": aspect.map { .string($0) }, "duration_seconds": durationSeconds.map { .number($0) }, "attachment_ids": attachmentIds.map { .array($0.map { .string($0) }) }, "agent_model": agentModel.map { .string($0) }, "character_slug": characterSlug.map { .string($0) }])
    }

    /// Search the user's media by what is in it: subjects, places, actions, tags.
    func searchLibrary(query: String? = nil, kind: String? = nil) async throws -> [MediaItem] {
        try await transport.send("GET", "/library", query: ["query": query.map { .string($0) }, "kind": kind.map { .string($0) }], body: nil)
    }

    /// Delete an item from the library. This can't be undone.
    func deleteMedia(id: String) async throws -> Deleted {
        try await transport.send("DELETE", "/library/\(APITransport.escape(id))", query: [:], body: nil)
    }

    /// Ask to add a photo or video from the device to the library. Answers with where to send the file: send its bytes to `url` with `method` and exactly the `headers` given, and no sign-in, since the address is its own permission and may be on another host. An address starting with `/` is on this instance. Then call complete_upload.
    func requestUpload(kind: String, name: String, contentType: String, sizeBytes: Double, aspect: String? = nil) async throws -> UploadTicket {
        try await transport.send("POST", "/uploads", query: [:], body: ["kind": .string(kind), "name": .string(name), "content_type": .string(contentType), "size_bytes": .number(sizeBytes), "aspect": aspect.map { .string($0) }])
    }

    /// Say that the file a request_upload ticket was given for has been sent. The instance checks it arrived as declared and answers with the library item. Safe to repeat.
    func completeUpload(id: String) async throws -> MediaItem {
        try await transport.send("POST", "/uploads/\(APITransport.escape(id))/complete", query: [:], body: nil)
    }

    /// Ask about a video: summarise it, find moments, answer a question.
    func understandVideo(source: String, question: String) async throws -> VideoAnalysis {
        try await transport.send("POST", "/understand", query: [:], body: ["source": .string(source), "question": .string(question)])
    }

    /// List characters to cast in a scene: the person's own, then those shared on the instance. Characters for adults only aren't listed.
    /// Open to guests.
    func listCharacters(query: String? = nil) async throws -> [Character] {
        try await transport.send("GET", "/characters", query: ["query": query.map { .string($0) }], body: nil)
    }

    /// Create a character to cast in scenes. It is private unless shared with everyone on the instance.
    func createCharacter(name: String, description: String, greeting: String, tagline: String? = nil, visibility: String? = nil) async throws -> Character {
        try await transport.send("POST", "/characters", query: [:], body: ["name": .string(name), "description": .string(description), "greeting": .string(greeting), "tagline": tagline.map { .string($0) }, "visibility": visibility.map { .string($0) }])
    }

    /// One character: who they are, how they open and who made them.
    /// Open to guests.
    func getCharacter(slug: String) async throws -> Character {
        try await transport.send("GET", "/characters/\(APITransport.escape(slug))", query: [:], body: nil)
    }

    /// Report a shared character to the instance's operator, with a reason.
    func reportCharacter(slug: String, reason: String, note: String? = nil) async throws -> CharacterReport {
        try await transport.send("POST", "/characters/\(APITransport.escape(slug))/report", query: [:], body: ["reason": .string(reason), "note": note.map { .string($0) }])
    }

    /// Block a shared character: it, and everything else by its author, is hidden from the person from now on.
    func blockCharacter(slug: String) async throws -> CharacterBlock {
        try await transport.send("POST", "/characters/\(APITransport.escape(slug))/block", query: [:], body: nil)
    }

    /// The user's plan, the plans and credit packs on offer, and what the payment provider supports.
    func getAccount() async throws -> PlanAndCredits {
        try await transport.send("GET", "/account", query: [:], body: nil)
    }

    /// The user's settings: saving conversations, asking before spending, default shape and length, and adult content.
    func getPreferences() async throws -> Preferences {
        try await transport.send("GET", "/preferences", query: [:], body: nil)
    }

    /// Change some of the user's settings. Adult content and the age confirmation can only be changed on the web, never from a phone.
    func updatePreferences(saveChats: Bool? = nil, confirmBeforeSpending: Bool? = nil, enterSends: Bool? = nil, completionNotifications: Bool? = nil, defaultAspect: String? = nil, defaultDuration: Double? = nil, ageConfirmed: Bool? = nil, adultContent: Bool? = nil) async throws -> Preferences {
        try await transport.send("PATCH", "/preferences", query: [:], body: ["saveChats": saveChats.map { .bool($0) }, "confirmBeforeSpending": confirmBeforeSpending.map { .bool($0) }, "enterSends": enterSends.map { .bool($0) }, "completionNotifications": completionNotifications.map { .bool($0) }, "defaultAspect": defaultAspect.map { .string($0) }, "defaultDuration": defaultDuration.map { .number($0) }, "ageConfirmed": ageConfirmed.map { .bool($0) }, "adultContent": adultContent.map { .bool($0) }])
    }

    /// Who can see a job on this instance: the instance operator and the compute operator, for each way of running it.
    /// Open to guests.
    func getPrivacy() async throws -> PrivacyDescription {
        try await transport.send("GET", "/privacy", query: [:], body: nil)
    }

    /// The user's credit balance and budget.
    func getBalance() async throws -> CreditBalance {
        try await transport.send("GET", "/balance", query: [:], body: nil)
    }

    /// What the user has spent, by capability, and recent jobs.
    func getUsage() async throws -> Usage {
        try await transport.send("GET", "/usage", query: [:], body: nil)
    }

    /// Open a real-time session, such as a live restyle of a camera. It stays open and is billed by the second until closed.
    func openSession(app: String, prompt: String, destinationIds: [String]? = nil, record: Bool? = nil) async throws -> LiveSession {
        try await transport.send("POST", "/sessions", query: [:], body: ["app": .string(app), "prompt": .string(prompt), "destination_ids": destinationIds.map { .array($0.map { .string($0) }) }, "record": record.map { .bool($0) }])
    }

    /// Change a running session's prompt without closing it.
    func updateSession(id: String, prompt: String) async throws -> LiveSession {
        try await transport.send("PATCH", "/sessions/\(APITransport.escape(id))", query: [:], body: ["prompt": .string(prompt)])
    }

    /// Close a real-time session.
    func closeSession(id: String) async throws -> LiveSession {
        try await transport.send("DELETE", "/sessions/\(APITransport.escape(id))", query: [:], body: nil)
    }
}

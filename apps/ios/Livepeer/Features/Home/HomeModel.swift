import SwiftUI

@Observable
final class HomeModel {
    enum Phase: Equatable { case loading, loaded, failed }

    private(set) var phase: Phase = .loading
    private(set) var starters: [PromptStarter] = []
    private(set) var sending = false
    /// Why the last send didn't go through, in words for the user.
    var sendError: String?
    var draft = Draft()
    private let api: API

    init(api: API) { self.api = api }

    func load() async {
        if phase == .failed { phase = .loading }
        do {
            starters = try await api.listPromptStarters()
            phase = .loaded
        } catch {
            if starters.isEmpty { phase = .failed }
        }
    }

    /// Starts a conversation from a starting point. Its name is the whole request: the agent asks for
    /// the rest before it makes anything. What is in the composer stays there.
    func start(_ starter: PromptStarter) async -> Conversation? {
        await create(text: starter.label, app: starter.app, attachments: [], cast: nil)
    }

    func send() async -> Conversation? {
        guard draft.canSend else { return nil }
        let conversation = await create(text: draft.text, app: draft.app, attachments: draft.attachments, cast: draft.cast)
        if conversation != nil { draft = Draft() }
        return conversation
    }

    private func create(text: String, app: String?, attachments: [MediaItem], cast: CharacterCast?) async -> Conversation? {
        guard !sending else { return nil }
        sending = true
        sendError = nil
        defer { sending = false }
        do {
            return try await api.createConversation(
                text: text,
                app: app,
                aspect: draft.aspect,
                durationSeconds: draft.durationSeconds,
                attachmentIds: attachments.isEmpty ? nil : attachments.map(\.id),
                agentModel: draft.model,
                characterSlug: cast?.slug
            )
        } catch let error as APIError where error.isSignedOut {
            sendError = "Sign in to send a request."
        } catch {
            sendError = "That didn't send. Check your connection and try again."
        }
        return nil
    }
}

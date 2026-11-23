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
    var openStarter: String?
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

    /// Opens or closes a starting point. It reveals examples; it never sends.
    func toggle(_ starter: PromptStarter) {
        let closing = openStarter == starter.id
        openStarter = closing ? nil : starter.id
        if !closing { draft.app = starter.app }
    }

    /// Puts an example's words in the composer, ready to edit.
    func fill(_ prompt: String, app: String) {
        draft.prompt = prompt
        draft.app = app
        openStarter = nil
    }

    func send() async -> Conversation? {
        guard draft.canSend, !sending else { return nil }
        sending = true
        sendError = nil
        defer { sending = false }
        do {
            let conversation = try await api.createConversation(
                text: draft.text,
                app: draft.app,
                aspect: draft.aspect,
                durationSeconds: draft.durationSeconds,
                attachmentIds: draft.attachments.isEmpty ? nil : draft.attachments.map(\.id),
                agentModel: draft.model,
                characterSlug: draft.cast?.slug
            )
            draft = Draft()
            return conversation
        } catch let error as APIError where error.isSignedOut {
            sendError = "Sign in to send a request."
        } catch {
            sendError = "That didn't send. Check your connection and try again."
        }
        return nil
    }
}

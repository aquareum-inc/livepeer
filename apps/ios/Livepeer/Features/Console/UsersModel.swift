import SwiftUI

/// Every account the engine knows, searched on the instance by name, label or id.
@Observable
final class UsersModel {
    /// What an operator can set a user's allocation to from a phone.
    enum Status: String {
        case active, paused

        /// The words beside the face or fingerprint prompt: the same as the tray's.
        func prompt(for user: KnownActor) -> String {
            self == .paused ? "Suspend \(user.displayName)" : "Resume \(user.displayName)"
        }
    }

    enum Phase: Equatable { case loading, loaded, failed(String) }

    var query = ""
    private(set) var users: [KnownActor] = []
    private(set) var phase = Phase.loading
    /// Counts confirmed changes, for the one haptic each gets.
    private(set) var changes = 0
    private let read: (_ query: String?) async throws -> [KnownActor]
    private let setStatus: (KnownActor, Status) async throws -> Bool

    init(read: @escaping (_ query: String?) async throws -> [KnownActor], setStatus: @escaping (KnownActor, Status) async throws -> Bool) {
        self.read = read
        self.setStatus = setStatus
    }

    func user(_ id: String) -> KnownActor? { users.first { $0.actorId == id } }

    /// Searches for what is typed now; an answer to an earlier search is dropped.
    func load() async {
        let asked = query.trimmingCharacters(in: .whitespaces)
        do {
            let found = try await read(asked.isEmpty ? nil : asked)
            guard asked == query.trimmingCharacters(in: .whitespaces) else { return }
            users = found
            phase = .loaded
        } catch is CancellationError {
            return
        } catch {
            if let refusal = error as? APIError, refusal.status == 401 { return }
            if users.isEmpty { phase = .failed((error as? APIError)?.message ?? "The users didn't load. Check your connection.") }
        }
    }

    /// Suspends or resumes a user. The row and the detail change only once the instance has said it is done.
    /// Nil when done; otherwise why not.
    func set(_ user: KnownActor, to status: Status, instance: String) async throws -> String? {
        do {
            guard try await setStatus(user, status) else { return "\(instance) couldn't change that account. Nothing was changed." }
            if let index = users.firstIndex(where: { $0.actorId == user.actorId }) {
                users[index].allocation?.status = status == .paused ? .paused : .active
            }
            changes += 1
            await load()
            return nil
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            return ConsoleSession.changeMessage(for: error, instance: instance)
        }
    }
}

nonisolated extension KnownActor {
    /// The person's name where the engine has one, the account's label otherwise.
    var displayName: String {
        if let name, !name.isEmpty { return name }
        return label.isEmpty ? actorId : label
    }

    /// Where the account stands, in a word. An account with no allocation can't run anything yet.
    var standing: String {
        switch allocation?.status {
        case .active: "Active"
        case .paused: "Suspended"
        case .exhausted: "Out of credit"
        case .revoked: "Revoked"
        case .unknown, nil: "No allocation"
        }
    }

    var tone: StateDot.Tone {
        switch allocation?.status {
        case .active: .good
        case .paused, .revoked: .bad
        case .exhausted: .ink
        case .unknown, nil: .quiet
        }
    }

    /// Whether a phone can suspend or resume the account: only between active and suspended.
    var canSuspend: Bool { allocation?.status == .active }
    var canResume: Bool { allocation?.status == .paused }
}

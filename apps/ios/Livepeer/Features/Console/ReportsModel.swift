import SwiftUI

/// Reports of shared characters: the ones waiting for a decision, then the ones already decided.
@Observable
final class ReportsModel {
    /// What an operator can decide about a report.
    enum Outcome: String {
        /// The character stays up.
        case dismissed
        /// The character comes off the instance for everyone.
        case hidden

        /// The words beside the face or fingerprint prompt: the same as the tray's.
        func prompt(for report: CharacterReport) -> String {
            self == .hidden ? "Take \(report.characterName) down" : "Keep \(report.characterName) up"
        }
    }

    enum Phase: Equatable { case loading, loaded, failed(String) }

    private(set) var reports: [CharacterReport] = []
    private(set) var phase = Phase.loading
    /// Counts confirmed changes, for the one haptic each gets.
    private(set) var changes = 0
    private let read: () async throws -> [CharacterReport]
    private let resolve: (CharacterReport, Outcome) async throws -> CharacterReport

    init(read: @escaping () async throws -> [CharacterReport], resolve: @escaping (CharacterReport, Outcome) async throws -> CharacterReport) {
        self.read = read
        self.resolve = resolve
    }

    /// Open reports, oldest first: the one that has waited longest is at the top of the queue.
    var waiting: [CharacterReport] {
        reports.filter { $0.state == .open }.sorted { $0.createdAt < $1.createdAt }
    }

    /// Decided reports, newest first.
    var decided: [CharacterReport] {
        reports.filter { $0.state != .open }.sorted { $0.createdAt > $1.createdAt }
    }

    func report(_ id: String) -> CharacterReport? { reports.first { $0.id == id } }

    func load() async {
        do {
            reports = try await read()
            phase = .loaded
        } catch is CancellationError {
            return
        } catch {
            if let refusal = error as? APIError, refusal.status == 401 { return }
            if reports.isEmpty { phase = .failed((error as? APIError)?.message ?? "The reports didn't load. Check your connection.") }
        }
    }

    /// Decides a report. The list changes only from the instance's answer: the decided report as it now is, then
    /// the queue read again, since taking a character down closes its other open reports too. Nil when done;
    /// otherwise why not.
    func decide(_ report: CharacterReport, _ outcome: Outcome, instance: String) async throws -> String? {
        do {
            let decided = try await resolve(report, outcome)
            if let index = reports.firstIndex(where: { $0.id == decided.id }) { reports[index] = decided }
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

extension CharacterReportState {
    /// A decision in words.
    var word: String {
        switch self {
        case .open: "Waiting"
        case .dismissed: "Kept up"
        case .hidden: "Taken down"
        case .unknown: "Decided"
        }
    }
}

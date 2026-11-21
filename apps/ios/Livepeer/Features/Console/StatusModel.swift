import SwiftUI

/// The Status screen's answer and how it was got: read once when the console opens, then on pull to refresh.
@Observable
final class StatusModel {
    enum Trouble: Equatable {
        /// The instance didn't answer at all.
        case unreachable
        /// It answered and refused, in its own words.
        case refused(String)
    }

    private(set) var status: OperatorStatus?
    /// When this phone got the last answer, by its own clock, so "Checked 12 s ago" doesn't depend on the instance's.
    private(set) var checked: Date?
    private(set) var trouble: Trouble?
    private(set) var loading = false
    private let read: () async throws -> OperatorStatus

    init(read: @escaping () async throws -> OperatorStatus) {
        self.read = read
    }

    func load() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let fresh = try await read()
            withAnimation(.enter) { status = fresh }
            checked = .now
            trouble = nil
        } catch let error as APIError {
            // A lock or a sign-out replaces the whole console; there's nothing for this screen to say.
            trouble = error.status == 401 ? nil : .refused(error.message)
        } catch is CancellationError {
            return
        } catch {
            trouble = .unreachable
        }
    }

    /// Whether what needs attention includes the service itself, not only work waiting in a queue.
    static func serviceIsDown(_ attention: [OperatorAttention]) -> Bool {
        attention.contains { $0.kind != .reportsWaiting }
    }
}

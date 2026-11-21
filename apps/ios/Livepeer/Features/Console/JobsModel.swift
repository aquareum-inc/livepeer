import SwiftUI

/// Recent jobs across all users, newest first, filtered by state and read a page at a time.
@Observable
final class JobsModel {
    enum Filter: String, CaseIterable, Identifiable {
        case all, failed, running

        var id: Self { self }
        var label: String {
            switch self {
            case .all: "All"
            case .failed: "Failed"
            case .running: "Running"
            }
        }

        /// The state the instance filters by; none for all.
        var status: String? { self == .all ? nil : rawValue }

        var emptyMessage: String {
            switch self {
            case .all: "No jobs have run yet."
            case .failed: "Nothing has failed."
            case .running: "Nothing is running."
            }
        }
    }

    enum Phase: Equatable { case loading, loaded, failed(String) }

    typealias Page = (_ status: String?, _ before: String?, _ limit: Int) async throws -> [EngineJob]

    private(set) var filter = Filter.all
    private(set) var jobs: [EngineJob] = []
    private(set) var phase = Phase.loading
    /// Whether there may be older jobs than the last one shown.
    private(set) var more = false
    private(set) var loadingMore = false
    /// Why the next page didn't come, shown at the foot of the list.
    private(set) var moreFailure: String?
    private let page: Page
    static let pageSize = 30

    init(page: @escaping Page) {
        self.page = page
    }

    /// Shows a filter's first page, clearing the list at once so one filter's rows never sit under another's name.
    func show(_ next: Filter) async {
        guard next != filter else { return }
        filter = next
        jobs = []
        phase = .loading
        await load()
    }

    /// Reads the first page again. Keeps what is shown until the answer arrives.
    func load() async {
        let asked = filter
        do {
            let first = try await page(asked.status, nil, Self.pageSize)
            guard asked == filter else { return }
            jobs = first
            more = first.count == Self.pageSize
            moreFailure = nil
            phase = .loaded
        } catch is CancellationError {
            return
        } catch {
            guard asked == filter else { return }
            if let refusal = error as? APIError, refusal.status == 401 { return }
            if jobs.isEmpty { phase = .failed(Self.message(for: error)) }
        }
    }

    /// Reads the page before the oldest job shown.
    func loadMore() async {
        guard more, !loadingMore, phase == .loaded, let last = jobs.last else { return }
        let asked = filter
        loadingMore = true
        defer { loadingMore = false }
        do {
            let older = try await page(asked.status, last.createdAt, Self.pageSize)
            guard asked == filter else { return }
            let known = Set(jobs.map(\.id))
            jobs.append(contentsOf: older.filter { !known.contains($0.id) })
            more = older.count == Self.pageSize
            moreFailure = nil
        } catch {
            guard asked == filter, !(error is CancellationError) else { return }
            moreFailure = Self.message(for: error)
        }
    }

    private static func message(for error: Error) -> String {
        (error as? APIError)?.message ?? "The jobs didn't load. Check your connection."
    }
}

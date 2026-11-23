import Foundation
import Synchronization

/// The last answer to each read and its ETag, so a read that hasn't changed comes back as 304 with no body.
/// Small: it only needs to hold what is being followed right now.
nonisolated final class ReadCache: Sendable {
    private struct Entry { let etag: String; let data: Data; let token: String? }
    private let entries = Mutex<[URL: Entry]>([:])
    private static let limit = 64

    func validator(for url: URL, token: String?) -> String? {
        entries.withLock { $0[url].flatMap { $0.token == token ? $0.etag : nil } }
    }

    func data(for url: URL) -> Data? { entries.withLock { $0[url]?.data } }

    func store(_ data: Data, etag: String, for url: URL, token: String?) {
        entries.withLock { entries in
            if entries.count >= Self.limit, entries[url] == nil, let first = entries.keys.first { entries[first] = nil }
            entries[url] = Entry(etag: etag, data: data, token: token)
        }
    }
}

/// What the instance said when it refused or failed a request.
nonisolated struct APIError: Error, Equatable, LocalizedError {
    let status: Int
    let message: String
    /// A stable reason to act on: `signed_out`, `mobile_off`, `account_required`, `sign_in_expired`.
    var code: String?

    var errorDescription: String? { message }
    /// The session is missing, expired or revoked.
    var isSignedOut: Bool { status == 401 }
    /// The instance has stopped serving its apps.
    var isMobileOff: Bool { code == "mobile_off" }
}

/// A refusal that changes the whole app, not just one screen: a token that stopped working, or an instance
/// that stopped serving phones. `token` is the one the request carried, so a late answer to an old session
/// can't sign out a newer one.
nonisolated struct Refusal: Sendable {
    let error: APIError
    let token: String
}

/// Sends requests to one instance's `/api/v1`. The generated `API` calls this; nothing else does.
struct APITransport: Sendable {
    let baseURL: URL
    /// The bearer token to send, if the caller has one. Guests send none.
    let token: @Sendable () -> String?
    /// Told about refusals that end the session or close the app; see `Refusal`.
    var refused: @Sendable (Refusal) -> Void = { _ in }
    var session: URLSession = .shared
    var cache = ReadCache()

    private struct Envelope: Decodable {
        struct Body: Decodable { let status: Int; let message: String; let code: String? }
        let error: Body
    }

    func send<Output: Decodable>(_ method: String, _ path: String, query: [String: JSONValue?], body: [String: JSONValue?]?) async throws -> Output {
        var components = URLComponents(url: baseURL.appending(path: "api/v1" + path), resolvingAgainstBaseURL: false)!
        let items = query.compactMap { key, value in value?.queryText.map { URLQueryItem(name: key, value: $0) } }.sorted { $0.name < $1.name }
        if !items.isEmpty { components.queryItems = items }

        let url = components.url!
        var request = URLRequest(url: url)
        request.httpMethod = method
        // The ETags are handled here, so the system cache doesn't answer for the instance.
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let sent = token()
        if let sent { request.setValue("Bearer \(sent)", forHTTPHeaderField: "Authorization") }
        if method == "GET", let etag = cache.validator(for: url, token: sent) { request.setValue(etag, forHTTPHeaderField: "If-None-Match") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body.compactMapValues { $0 })
        }

        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 304, let kept = cache.data(for: url) { return try JSONDecoder().decode(Output.self, from: kept) }
        if method == "GET", status == 200, let etag = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "ETag") {
            cache.store(data, etag: etag, for: url, token: sent)
        }
        guard (200..<300).contains(status) else {
            let envelope = (try? JSONDecoder().decode(Envelope.self, from: data))?.error
            let error = APIError(status: status, message: envelope?.message ?? "The request failed.", code: envelope?.code)
            if let sent, error.isSignedOut || error.isMobileOff { refused(Refusal(error: error, token: sent)) }
            throw error
        }
        return try JSONDecoder().decode(Output.self, from: data)
    }

    /// Sends a file to where an upload ticket said to, with the same sign-in, and reads what comes back.
    /// `path` is the ticket's own, on this instance.
    func put<Output: Decodable>(file: URL, contentType: String, to path: String) async throws -> Output {
        guard path.hasPrefix("/api/v1/"), let url = URL(string: path, relativeTo: baseURL) else { throw APIError(status: 0, message: "The request failed.", code: nil) }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        let sent = token()
        if let sent { request.setValue("Bearer \(sent)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.upload(for: request, fromFile: file)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let envelope = (try? JSONDecoder().decode(Envelope.self, from: data))?.error
            let error = APIError(status: status, message: envelope?.message ?? "The request failed.", code: envelope?.code)
            if let sent, error.isSignedOut || error.isMobileOff { refused(Refusal(error: error, token: sent)) }
            throw error
        }
        return try JSONDecoder().decode(Output.self, from: data)
    }

    /// A value as one path segment.
    static func escape(_ segment: String) -> String {
        segment.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? segment
    }
}

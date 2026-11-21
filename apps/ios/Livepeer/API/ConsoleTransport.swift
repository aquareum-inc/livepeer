import Foundation

/// Carries the console's requests to the instance's `/api/v1` with the operator device session's token and, for
/// a change, its proof. Apart from the user app's transport on purpose: nothing an operator reads is cached or
/// written to disk, and a refusal here never touches the user's own session.
nonisolated struct ConsoleTransport: OperatorTransport {
    let baseURL: URL
    /// The operator device session's token, when this phone has one.
    let token: @Sendable () -> String?
    var session: URLSession = ConsoleTransport.unstored

    /// No cache, no cookies, nothing on disk.
    static let unstored: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpCookieStorage = nil
        configuration.timeoutIntervalForRequest = 15
        return URLSession(configuration: configuration)
    }()

    private struct Envelope: Decodable {
        struct Body: Decodable { let status: Int; let message: String; let code: String? }
        let error: Body
    }

    func send<Output: Decodable>(_ method: String, _ path: String, query: [String: JSONValue?], body: [String: JSONValue?]?, proof: OperatorProof?) async throws -> Output {
        var components = URLComponents(url: baseURL.appending(path: "api/v1" + path), resolvingAgainstBaseURL: false)!
        let items = query.compactMap { key, value in value?.queryText.map { URLQueryItem(name: key, value: $0) } }.sorted { $0.name < $1.name }
        if !items.isEmpty { components.queryItems = items }

        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = token() { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let proof { request.setValue(proof.header, forHTTPHeaderField: "X-Operator-Proof") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body.compactMapValues { $0 })
        }

        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let envelope = (try? JSONDecoder().decode(Envelope.self, from: data))?.error
            throw APIError(status: status, message: envelope?.message ?? "The request failed.", code: envelope?.code)
        }
        return try JSONDecoder().decode(Output.self, from: data)
    }
}

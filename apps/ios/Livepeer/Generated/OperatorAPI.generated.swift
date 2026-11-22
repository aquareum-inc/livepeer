// Generated from docs/mobile/openapi.json by packages/mobile-codegen.
// Do not edit: change apps/web/lib/public-api/operations.ts or the API client's types and run `pnpm mobile:generate`.

import Foundation

/// A confirmation of one change: the nonce the instance gave for exactly that operation and input, and the
/// phone key's signature over it, made after a face or fingerprint. Good once, for 60 seconds.
struct OperatorProof: Sendable {
    let nonce: String
    let signature: String

    /// The value of the X-Operator-Proof header.
    var header: String { "\(nonce).\(signature)" }
}

/// What carries the console's requests: the operator device session's token, and a proof when there is one.
/// Only the console's own session implements it; the user app's transport does not.
protocol OperatorTransport: Sendable {
    func send<Output: Decodable>(_ method: String, _ path: String, query: [String: JSONValue?], body: [String: JSONValue?]?, proof: OperatorProof?) async throws -> Output
}

/// The operator console's operations a phone may call. It is made from an operator session and nothing else,
/// and every change takes a proof.
struct OperatorAPI<Transport: OperatorTransport>: Sendable {
    private let transport: Transport

    init(session transport: Transport) {
        self.transport = transport
    }

    /// Native apps: collect a finished operator sign-in with its one-time code and PKCE verifier, and enrol the phone's public key. Answers with an operator device session token, shown once.
    /// Open to guests.
    func createOperatorDeviceSession(code: String, verifier: String, platform: String, publicKey: String, deviceName: String? = nil) async throws -> OperatorDeviceToken {
        try await transport.send("POST", "/auth/operator-device", query: [:], body: ["code": .string(code), "verifier": .string(verifier), "platform": .string(platform), "public_key": .string(publicKey), "device_name": deviceName.map { .string($0) }], proof: nil)
    }

    /// Native apps: sign this phone out of the console by ending the operator device session making the request.
    func deleteOperatorDeviceSession() async throws -> Deleted {
        try await transport.send("DELETE", "/auth/operator-device", query: [:], body: nil, proof: nil)
    }

    /// Native apps: ask for a nonce for the phone's key to sign, to unlock the console or to confirm one change. It is good once, for 60 seconds.
    func createOperatorChallenge(purpose: String, inputHash: String? = nil) async throws -> OperatorChallenge {
        try await transport.send("POST", "/operator/device/challenge", query: [:], body: ["purpose": .string(purpose), "input_hash": inputHash.map { .string($0) }], proof: nil)
    }

    /// Native apps: open the console on this phone for five minutes, with the phone's signature over an unlock nonce.
    func unlockOperatorDeviceSession(nonce: String, signature: String) async throws -> OperatorUnlock {
        try await transport.send("POST", "/operator/device/unlock", query: [:], body: ["nonce": .string(nonce), "signature": .string(signature)], proof: nil)
    }

    /// Operator: whether anything needs attention, today's figures and the state of the service, in one answer.
    /// Needs the console unlocked on this phone.
    func operatorStatus() async throws -> OperatorStatus {
        try await transport.send("GET", "/operator/status", query: [:], body: nil, proof: nil)
    }

    /// Operator: active users, jobs today, revenue, wholesale cost and margin.
    /// Needs the console unlocked on this phone.
    func operatorOverview() async throws -> OverviewStats {
        try await transport.send("GET", "/operator/overview", query: [:], body: nil, proof: nil)
    }

    /// Operator: engine readiness, discovery freshness, cost sync and version.
    /// Needs the console unlocked on this phone.
    func operatorHealth() async throws -> EngineHealth {
        try await transport.send("GET", "/operator/health", query: [:], body: nil, proof: nil)
    }

    /// Operator: every account the engine knows, with its allocation. A query filters by name, label or id.
    /// Needs the console unlocked on this phone.
    func operatorListUsers(query: String? = nil) async throws -> [KnownActor] {
        try await transport.send("GET", "/operator/users", query: ["query": query.map { .string($0) }], body: nil, proof: nil)
    }

    /// Operator: suspend (pause) or resume a user's allocation. Suspending also signs out their phones and tablets, and ends any console session they have on a phone.
    /// Needs its own proof: a nonce for exactly this input, signed after a face or fingerprint.
    func operatorSetUserStatus(id: String, status: String, applicationId: String? = nil, proof: OperatorProof) async throws -> Done {
        try await transport.send("POST", "/operator/users/\(APITransport.escape(id))/status", query: [:], body: ["status": .string(status), "application_id": applicationId.map { .string($0) }], proof: proof)
    }

    /// Operator: recent jobs across all users, newest first, with attempts and failures. Filter by state, and page back with the created_at of the last job seen.
    /// Needs the console unlocked on this phone.
    func operatorListJobs(limit: Double? = nil, status: String? = nil, before: String? = nil) async throws -> [EngineJob] {
        try await transport.send("GET", "/operator/jobs", query: ["limit": limit.map { .number($0) }, "status": status.map { .string($0) }, "before": before.map { .string($0) }], body: nil, proof: nil)
    }

    /// Operator: wholesale network cost by class and capability over a number of days.
    /// Needs the console unlocked on this phone.
    func operatorCosts(days: Double? = nil) async throws -> CostSummary {
        try await transport.send("GET", "/operator/costs", query: ["days": days.map { .number($0) }], body: nil, proof: nil)
    }

    /// Operator: reports of shared characters, open ones first.
    /// Needs the console unlocked on this phone.
    func operatorListReports() async throws -> [CharacterReport] {
        try await transport.send("GET", "/operator/reports", query: [:], body: nil, proof: nil)
    }

    /// Operator: decide a report. Dismiss leaves the character up; hide takes it off the instance for everyone.
    /// Needs its own proof: a nonce for exactly this input, signed after a face or fingerprint.
    func operatorResolveReport(id: String, outcome: String, proof: OperatorProof) async throws -> CharacterReport {
        try await transport.send("POST", "/operator/reports/\(APITransport.escape(id))", query: [:], body: ["outcome": .string(outcome)], proof: proof)
    }

    /// Operator: grants and their funding.
    /// Needs the console unlocked on this phone.
    func operatorListGrants() async throws -> [Grant] {
        try await transport.send("GET", "/operator/grants", query: [:], body: nil, proof: nil)
    }

    /// Operator: the provider's plans and allowances.
    /// Needs the console unlocked on this phone.
    func operatorListPlans() async throws -> [Plan] {
        try await transport.send("GET", "/operator/plans", query: [:], body: nil, proof: nil)
    }

    /// Operator: the compute operators that ran this instance's recent jobs, with their runners, failures and median response time.
    /// Needs the console unlocked on this phone.
    func operatorListCompute() async throws -> [ComputeOperator] {
        try await transport.send("GET", "/operator/compute", query: [:], body: nil, proof: nil)
    }

    /// Operator: every capability discovered on the network, whether this instance offers it, its markup, and how many runners are ready.
    /// Needs the console unlocked on this phone.
    func operatorListCapabilities() async throws -> [OfferedCapability] {
        try await transport.send("GET", "/operator/capabilities", query: [:], body: nil, proof: nil)
    }

    /// The input of `operatorSetUserStatus` as the instance hashes it, for `createOperatorChallenge`.
    static func operatorSetUserStatusInput(id: String, status: String, applicationId: String? = nil) -> [String: JSONValue] {
        (["id": .string(id), "status": .string(status), "application_id": applicationId.map { .string($0) }] as [String: JSONValue?]).compactMapValues { $0 }
    }

    /// The input of `operatorResolveReport` as the instance hashes it, for `createOperatorChallenge`.
    static func operatorResolveReportInput(id: String, outcome: String) -> [String: JSONValue] {
        (["id": .string(id), "outcome": .string(outcome)] as [String: JSONValue?]).compactMapValues { $0 }
    }
}

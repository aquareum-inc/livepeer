import Foundation
import Testing
@testable import Livepeer

/// The operator console: what the phone signs, how it talks to the instance, and what its screens make of the answers.
@Suite(.serialized)
struct ConsoleTests {
    private static let fixtures = URL(filePath: #filePath).deletingLastPathComponent().appending(path: "../../../docs/mobile/fixtures").standardizedFileURL

    private func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
        try JSONDecoder().decode(type, from: Data(contentsOf: Self.fixtures.appending(path: "\(name).json")))
    }

    // MARK: Entry

    @Test func theConsoleIsOfferedOnlyToASignedInOperatorWhereTheInstanceServesIt() throws {
        var instance = try fixture("get_instance", as: InstanceDescription.self)
        var me = try fixture("get_me", as: Me.self)
        instance.surfaces.mobileConsole = true
        #expect(me.role == .user)
        #expect(!ConsoleSession.offered(to: me, by: instance))
        #expect(!ConsoleSession.offered(to: nil, by: instance))

        me.role = .operator
        #expect(ConsoleSession.offered(to: me, by: instance))
        #expect(!ConsoleSession.offered(to: me, by: nil))
        instance.surfaces.mobileConsole = false
        #expect(!ConsoleSession.offered(to: me, by: instance))
    }

    // MARK: Proofs

    private struct Vectors: Decodable {
        struct Input: Decodable { let input: [String: JSONValue]; let canonical: String; let hash: String }
        struct Unlock: Decodable { let nonce: String; let message: String }
        struct Confirm: Decodable {
            let nonce: String, operation: String, inputHash: String, message: String
            enum CodingKeys: String, CodingKey { case nonce, operation, inputHash = "input_hash", message }
        }
        struct Messages: Decodable { let unlock: Unlock; let confirm: Confirm }
        let inputs: [Input]
        let messages: Messages
    }

    @Test func inputsHashAsTheInstanceHashesThem() throws {
        let vectors = try fixture("operator_proof_vectors", as: Vectors.self)
        #expect(vectors.inputs.count >= 6)
        for vector in vectors.inputs {
            #expect(try OperatorProofs.canonical(vector.input) == vector.canonical)
            #expect(try OperatorProofs.inputHash(vector.input) == vector.hash)
        }
    }

    @Test func generatedInputsHashToTheSameVectors() throws {
        let vectors = try fixture("operator_proof_vectors", as: Vectors.self)
        let hashes = Set(vectors.inputs.map(\.hash))
        #expect(hashes.contains(try OperatorProofs.inputHash(OperatorAPI<ConsoleTransport>.operatorResolveReportInput(id: "rep_8Jk2", outcome: "hidden"))))
        #expect(hashes.contains(try OperatorProofs.inputHash(OperatorAPI<ConsoleTransport>.operatorSetUserStatusInput(id: "usr_demo_priya", status: "paused"))))
        #expect(hashes.contains(try OperatorProofs.inputHash(OperatorAPI<ConsoleTransport>.operatorSetUserStatusInput(id: "usr_demo_priya", status: "active", applicationId: "default"))))
    }

    @Test func signedMessagesMatchTheInstance() throws {
        let messages = try fixture("operator_proof_vectors", as: Vectors.self).messages
        #expect(OperatorProofs.unlockMessage(nonce: messages.unlock.nonce) == messages.unlock.message)
        #expect(OperatorProofs.confirmMessage(nonce: messages.confirm.nonce, operation: messages.confirm.operation, inputHash: messages.confirm.inputHash) == messages.confirm.message)
        #expect(OperatorProof(nonce: "n", signature: "s").header == "n.s")
        #expect(Data([0xfb, 0xff, 0xfe]).base64URL == "-__-")
    }

    // MARK: Responses

    @Test func sessionResponses() throws {
        let issued = try fixture("create_operator_device_session", as: OperatorDeviceToken.self)
        #expect(issued.token.hasPrefix("aqo_") && issued.device.platform == .ios)
        #expect(try !fixture("create_operator_challenge", as: OperatorChallenge.self).nonce.isEmpty)
        let unlocked = try fixture("unlock_operator_device_session", as: OperatorUnlock.self)
        #expect(ConsoleFormat.date(unlocked.unlockedUntil) != nil)
    }

    @Test func status() throws {
        let status = try fixture("operator_status", as: OperatorStatus.self)
        #expect(status.attention.first?.kind == .reportsWaiting && status.attention.first?.opens == .reports)
        #expect(status.today.jobs > 0 && status.service.engineReady)
        #expect(ConsoleFormat.date(status.service.discoveryObservedAt) != nil)
        // A report waiting is work in a queue, not the service being down.
        #expect(!StatusModel.serviceIsDown(status.attention))
        #expect(StatusModel.serviceIsDown(status.attention + [OperatorAttention(kind: .engineNotReady, message: "Engine isn't ready", count: nil, opens: .status)]))
        #expect(ConsoleTabs.offers(.jobs) && !ConsoleTabs.offers(.reports))
    }

    @Test func jobs() throws {
        let all = try fixture("operator_list_jobs", as: [EngineJob].self)
        let running = try #require(all.first)
        #expect(running.state == .running && running.took == nil && running.stateWord == "Running")
        #expect(running.facts == ["1\u{00A0}attempt", "…d4e5"])

        let failed = try #require(try fixture("operator_list_jobs_failed", as: [EngineJob].self).first)
        #expect(failed.state == .failed && failed.tone == .bad)
        #expect(failed.facts == ["unreachable", "1\u{00A0}attempt", "…ebcb"])
        #expect(JobDetailView.stateLine(for: failed) == "Failed after 900 ms")
        #expect(JobDetailView.outcome(of: try #require(failed.attempts.first)) == "unreachable · 502")
        #expect(failed.summary.contains("The runner closed the connection before answering."))
        #expect(failed.summary.contains("Attempt 1: unreachable on orch-ams-2.example.test"))
    }

    // MARK: Facts

    @Test func facts() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        #expect(ConsoleFormat.ago(now.addingTimeInterval(-2), now: now) == "just now")
        #expect(ConsoleFormat.ago(now.addingTimeInterval(-12), now: now) == "12 s ago")
        #expect(ConsoleFormat.ago(now.addingTimeInterval(-185), now: now) == "3 min ago")
        #expect(ConsoleFormat.ago(now.addingTimeInterval(-7300), now: now) == "2 h ago")
        #expect(ConsoleFormat.ago(now.addingTimeInterval(-200_000), now: now) == "2 d ago")
        // A clock a little ahead of the instance's never reads as the future.
        #expect(ConsoleFormat.ago(now.addingTimeInterval(30), now: now) == "just now")

        #expect(ConsoleFormat.duration(0.64) == "640 ms")
        #expect(ConsoleFormat.duration(9.2) == "9.2 s")
        #expect(ConsoleFormat.duration(72) == "1 min 12 s")
        #expect(ConsoleFormat.duration(120) == "2 min")
        #expect(ConsoleFormat.money(6.8707509) == "$6.87")
        #expect(ConsoleFormat.money(1234.5) == "$1,234.50")
        #expect(ConsoleFormat.count(1204) == "1,204")
        #expect(ConsoleFormat.name(ofApp: "text-to-video") == "Text to video")
        #expect(ConsoleFormat.tail("01931006-7c2e-7a10-9f3b-00a1b2c3ebcb") == "…ebcb")
        #expect(ConsoleFormat.host("https://orch-ams-2.example.test:8935/apps/x") == "orch-ams-2.example.test")
        #expect(ConsoleFormat.host(nil) == nil)
        #expect(ConsoleFormat.date("2026-11-21T19:03:15.308Z") != nil && ConsoleFormat.date("2026-11-21T19:03:15Z") != nil && ConsoleFormat.date("soon") == nil)

        #expect(ConsoleFormat.headline(needing: 0) == "Everything is running.")
        #expect(ConsoleFormat.headline(needing: 1) == "1 thing needs you.")
        #expect(ConsoleFormat.headline(needing: 3) == "3 things need you.")
    }

    @Test func signInRefusalsReadInWords() {
        #expect(ConsoleSession.signInMessage(for: ConsoleSession.SignInRefusal(reason: "not_operator"), instance: "Livepeer") == "This account doesn't run Livepeer.")
        #expect(ConsoleSession.signInMessage(for: ConsoleSession.SignInRefusal(reason: "mobile_console_off"), instance: "Livepeer") == "Livepeer doesn't offer its console on phones.")
        #expect(ConsoleSession.signInMessage(for: ConsoleSession.SignInRefusal(reason: "not_fresh"), instance: "Livepeer") == "Sign-in didn't finish. Try again.")
        #expect(ConsoleSession.signInMessage(for: DeviceKey.Failure.unavailable, instance: "Livepeer") == ConsoleSession.needsBiometrics)
    }

    // MARK: Screens' models

    @Test func statusKeepsItsLastAnswerWhenTheInstanceCantBeReached() async throws {
        let answer = try fixture("operator_status", as: OperatorStatus.self)
        nonisolated(unsafe) var reachable = true
        let model = StatusModel {
            guard reachable else { throw URLError(.notConnectedToInternet) }
            return answer
        }
        await model.load()
        #expect(model.status == answer && model.trouble == nil && model.checked != nil)

        reachable = false
        await model.load()
        #expect(model.trouble == .unreachable && model.status == answer)

        reachable = true
        await model.load()
        #expect(model.trouble == nil)
    }

    @Test func statusSaysWhatTheInstanceRefused() async {
        let model = StatusModel { throw APIError(status: 403, message: "The console isn't offered on phones here.", code: "mobile_console_off") }
        await model.load()
        #expect(model.trouble == .refused("The console isn't offered on phones here."))
        // A lock is the console's to show, not this screen's.
        let locked = StatusModel { throw APIError(status: 401, message: "Locked.", code: "locked") }
        await locked.load()
        #expect(locked.trouble == nil && locked.status == nil)
    }

    @Test func jobsPageBackFromTheOldestShown() async throws {
        let template = try #require(try fixture("operator_list_jobs", as: [EngineJob].self).first)
        func jobs(_ range: Range<Int>, state: JobState = .succeeded) -> [EngineJob] {
            range.map { index in
                var job = template
                job.id = "job-\(index)"
                job.state = state
                job.createdAt = "2026-11-21T10:00:\(String(format: "%02d", 59 - index % 60)).000Z"
                return job
            }
        }
        nonisolated(unsafe) var asked: [(status: String?, before: String?)] = []
        let model = JobsModel { status, before, limit in
            asked.append((status, before))
            #expect(limit == JobsModel.pageSize)
            if status == "failed" { return jobs(100..<103, state: .failed) }
            // The second page repeats the last job of the first, as a page cut on a shared time can.
            return before == nil ? jobs(0..<30) : jobs(29..<41)
        }

        await model.load()
        #expect(model.phase == .loaded && model.jobs.count == 30 && model.more)
        #expect(asked.last?.status == nil && asked.last?.before == nil)

        await model.loadMore()
        #expect(asked.last?.before == jobs(29..<30)[0].createdAt)
        #expect(model.jobs.count == 41 && Set(model.jobs.map(\.id)).count == 41)
        #expect(!model.more)
        let calls = asked.count
        await model.loadMore()
        #expect(asked.count == calls)

        await model.show(.failed)
        #expect(asked.last?.status == "failed" && asked.last?.before == nil)
        #expect(model.jobs.count == 3 && model.jobs.allSatisfy { $0.state == .failed } && !model.more)
    }

    @Test func jobsSayWhenThereAreNone() async {
        let model = JobsModel { _, _, _ in [] }
        await model.load()
        #expect(model.phase == .loaded && model.jobs.isEmpty)
        #expect(JobsModel.Filter.failed.emptyMessage == "Nothing has failed.")
        let failing = JobsModel { _, _, _ in throw URLError(.timedOut) }
        await failing.load()
        #expect(failing.phase == .failed("The jobs didn't load. Check your connection."))
    }

    // MARK: Transport

    @Test func transportSendsTheOperatorTokenAndProofAndNothingCached() async throws {
        StubProtocol.respond = { request in
            #expect(request.url?.absoluteString == "https://instance.test/api/v1/operator/jobs?before=2026-11-21T10:00:00Z&limit=30&status=failed")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer aqo_test")
            #expect(request.value(forHTTPHeaderField: "X-Operator-Proof") == nil)
            #expect(request.value(forHTTPHeaderField: "If-None-Match") == nil)
            return (200, Data("[]".utf8))
        }
        let api = OperatorAPI(session: ConsoleTransport(baseURL: URL(string: "https://instance.test")!, token: { "aqo_test" }, session: StubProtocol.session))
        #expect(try await api.operatorListJobs(limit: 30, status: "failed", before: "2026-11-21T10:00:00Z").isEmpty)

        let report = try Data(contentsOf: Self.fixtures.appending(path: "operator_resolve_report.json"))
        StubProtocol.respond = { request in
            #expect(request.httpMethod == "POST")
            #expect(request.value(forHTTPHeaderField: "X-Operator-Proof") == "nonce.signature")
            return (200, report)
        }
        _ = try await api.operatorResolveReport(id: "rep_8Jk2", outcome: "hidden", proof: OperatorProof(nonce: "nonce", signature: "signature"))
    }

    @Test func transportCarriesTheReasonForARefusal() async {
        StubProtocol.respond = { _ in (401, Data(#"{"error":{"status":401,"message":"Unlock the console to carry on.","code":"locked"}}"#.utf8)) }
        let api = OperatorAPI(session: ConsoleTransport(baseURL: URL(string: "https://instance.test")!, token: { "aqo_test" }, session: StubProtocol.session))
        await #expect(throws: APIError(status: 401, message: "Unlock the console to carry on.", code: "locked")) {
            _ = try await api.operatorStatus()
        }
    }
}

/// Answers the console transport's requests in tests, so nothing leaves the machine.
private nonisolated final class StubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var respond: (@Sendable (URLRequest) -> (Int, Data))?

    static var session: URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: configuration)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let (status, data) = Self.respond?(request) ?? (500, Data())
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

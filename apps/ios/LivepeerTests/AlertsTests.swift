import Foundation
import Testing
@testable import Livepeer

/// Alerts on an operator's phone: what the page says, and that nothing changes without a match (plan, section 18.9).
@Suite(.serialized)
@MainActor
struct AlertsTests {
    private static let fixtures = URL(filePath: #filePath).deletingLastPathComponent().appending(path: "../../../docs/mobile/fixtures").standardizedFileURL

    private func text(_ name: String) throws -> String {
        try String(contentsOf: Self.fixtures.appending(path: "\(name).json"), encoding: .utf8)
    }

    /// The phone's side, standing in for the system's settings and Apple's push service.
    @MainActor
    private final class Device: PushDevice {
        var permission: Bool?
        var grants = true
        var pushToken: String? = "aa11"
        var asked = 0
        var permits = 0
        var forgotten = 0
        let environment = "development"

        init(permission: Bool? = nil) { self.permission = permission }

        func allowed() async -> Bool? { permission }
        func permit() async -> Bool {
            permits += 1
            if permission == nil { permission = grants }
            return permission ?? false
        }
        func token() async throws -> String {
            asked += 1
            guard let pushToken else { throw PushUnavailable() }
            return pushToken
        }
        func forget() { forgotten += 1 }
    }

    private static let all: [OperatorAlertKind] = [.engineNotReady, .jobsFailing, .reportsWaiting]
    private static let labels: [OperatorAlertKind: String] = [.engineNotReady: "The engine stops being ready", .jobsFailing: "Jobs are failing", .reportsWaiting: "A report is waiting"]

    private static func alerts(_ state: OperatorAlertsState, on: Set<OperatorAlertKind> = [], offered: Bool = true) -> OperatorAlerts {
        OperatorAlerts(offered: offered, state: state, kinds: all.map { OperatorAlertChoice(kind: $0, label: labels[$0]!, on: on.contains($0)) }, until: state == .off ? nil : "2026-12-21T09:00:00Z", lastAlertAt: nil)
    }

    /// An instance that holds this phone's alerts and takes changes, and a phone to go with it.
    @MainActor
    private final class World {
        var held: OperatorAlerts
        let device: Device
        let memory = AlertsMemory(vault: TokenVault(service: "org.livepeer.tests.alerts.\(UUID().uuidString)", account: TokenVault.operatorAlertsAccount))
        var sets: [(kinds: [String], pushToken: String?, reason: String)] = []
        var refusal: Error?
        var testHanded = true
        private(set) var model: AlertsModel!

        init(held: OperatorAlerts = AlertsTests.alerts(.off), device: Device = Device()) {
            self.held = held
            self.device = device
            model = AlertsModel(
                device: device,
                memory: memory,
                read: { [unowned self] in
                    if let refusal { throw refusal }
                    return self.held
                },
                set: { [unowned self] kinds, pushToken, reason in
                    if let refusal { throw refusal }
                    sets.append((kinds, pushToken, reason))
                    self.held = kinds.isEmpty ? AlertsTests.alerts(.off) : AlertsTests.alerts(.on, on: Set(AlertsTests.all.filter { kinds.contains($0.rawValue) }))
                    return self.held
                },
                test: { [unowned self] in
                    if let refusal { throw refusal }
                    return testHanded
                }
            )
        }

        // What a test kept in the simulator's Keychain goes with it.
        isolated deinit { memory.clear() }
    }

    @Test func theInstancesAnswersDecode() throws {
        let read = try JSONDecoder().decode(OperatorAlerts.self, from: Data(text("operator_get_alerts").utf8))
        #expect(read.offered)
        #expect(read.state == .on)
        #expect(read.kinds.map(\.label) == ["The engine stops being ready", "Jobs are failing", "A report is waiting"])
        #expect(read.kinds.map(\.on) == [true, false, true])
        #expect(try JSONDecoder().decode(OperatorAlerts.self, from: Data(text("operator_set_alerts").utf8)).state == .on)
        #expect(try JSONDecoder().decode(Done.self, from: Data(text("operator_test_alert").utf8)).ok)
        // No answer about alerts ever carries the push token.
        for name in ["operator_get_alerts", "operator_set_alerts"] { #expect(try !text(name).contains("token")) }
    }

    @Test func whatIsSignedForAlertsIsWhatTheInstanceHashes() throws {
        struct Vectors: Decodable {
            struct Input: Decodable { let canonical: String; let hash: String }
            let inputs: [Input]
        }
        let vectors = try JSONDecoder().decode(Vectors.self, from: Data(text("operator_proof_vectors").utf8)).inputs
        let on = try #require(vectors.first { $0.canonical.contains("push_token") })
        let off = try #require(vectors.first { $0.canonical == #"{"kinds":[]}"# })
        let token = String(repeating: "5a", count: 32)
        #expect(try OperatorProofs.inputHash(OperatorAPI<ConsoleTransport>.operatorSetAlertsInput(kinds: ["engine_not_ready", "reports_waiting"], pushToken: token, environment: "development")) == on.hash)
        #expect(try OperatorProofs.canonical(OperatorAPI<ConsoleTransport>.operatorSetAlertsInput(kinds: ["engine_not_ready", "reports_waiting"], pushToken: token, environment: "development")) == on.canonical)
        // Turning off names no push token and no environment, and none is hashed.
        #expect(try OperatorProofs.inputHash(OperatorAPI<ConsoleTransport>.operatorSetAlertsInput(kinds: [])) == off.hash)
        #expect(try OperatorProofs.canonical(OperatorAPI<ConsoleTransport>.operatorTestAlertInput()) == "{}")
    }

    @Test func offUntilTurnedOnWithEveryKindOfferedAndNothingAskedOfTheSystem() async {
        let world = World()
        #expect(world.model.standing == .unknown)
        #expect(world.model.phase == .loading)
        await world.model.load()
        #expect(world.model.standing == .off)
        #expect(world.model.draft == Set(Self.all))
        #expect(world.model.action == "Turn on alerts")
        #expect(world.model.summary == "Off")
        // Reading the page asks the system for nothing: no permission question and no push token.
        #expect(world.device.asked == 0)
        #expect(world.device.permits == 0)
        #expect(world.memory.value == AlertsMemory.Remembered())
    }

    @Test func turningOnAsksToShowNotificationsThenForAPushTokenThenTheInstance() async throws {
        let world = World()
        await world.model.load()
        world.model.toggle(.jobsFailing)
        #expect(try await world.model.apply(instance: "Livepeer") == nil)
        #expect(world.device.permits == 1)
        // The kinds go in the instance's own order, with this phone's push token, under the words beside the prompt.
        #expect(world.sets.count == 1)
        #expect(world.sets[0].kinds == ["engine_not_ready", "reports_waiting"])
        #expect(world.sets[0].pushToken == "aa11")
        #expect(world.sets[0].reason == "Turn on alerts")
        #expect(world.model.standing == .on)
        #expect(world.model.summary == "On · 2 of 3")
        #expect(world.model.action == nil)
        #expect(world.model.changes == 1)
        #expect(world.memory.value == AlertsMemory.Remembered(kinds: ["engine_not_ready", "reports_waiting"], registered: "aa11"))
    }

    @Test func nothingIsSentWhenNotificationsAreRefusedOrThereIsNoPushToken() async throws {
        let refusing = Device()
        refusing.grants = false
        let refused = World(device: refusing)
        await refused.model.load()
        #expect(try await refused.model.apply(instance: "Livepeer") == "Notifications are off for Livepeer in Settings, so alerts can't show.")
        #expect(refused.device.asked == 0)
        #expect(refused.sets.isEmpty)
        #expect(refused.model.standing == .off)

        let silent = Device()
        silent.pushToken = nil
        let unreachable = World(device: silent)
        await unreachable.model.load()
        #expect(try await unreachable.model.apply(instance: "Livepeer") == "This phone couldn't be given an address for alerts. Check your connection and try again.")
        #expect(unreachable.sets.isEmpty)
        #expect(unreachable.memory.value.registered == nil)
    }

    @Test func aClosedPromptOrARefusalChangesNothing() async throws {
        let world = World()
        await world.model.load()
        world.refusal = CancellationError()
        await #expect(throws: CancellationError.self) { try await world.model.apply(instance: "Livepeer") }
        world.refusal = APIError(status: 409, message: "This service hasn't set up alerts for this kind of phone.", code: "alerts_not_offered")
        #expect(try await world.model.apply(instance: "Livepeer") == "This service hasn't set up alerts for this kind of phone.")
        world.refusal = URLError(.notConnectedToInternet)
        #expect(try await world.model.apply(instance: "Livepeer") == "Can't reach Livepeer. Nothing was changed.")
        #expect(world.model.standing == .off)
        #expect(world.model.changes == 0)
        #expect(world.memory.value.registered == nil)
    }

    @Test func theSwitchesAreADraftUntilSavedAndSavingNoneTurnsAlertsOff() async throws {
        let world = World(held: Self.alerts(.on, on: [.engineNotReady]), device: Device(permission: true))
        world.memory.value = AlertsMemory.Remembered(kinds: ["engine_not_ready"], registered: "aa11")
        await world.model.load()
        #expect(world.model.draft == [.engineNotReady])
        #expect(world.model.action == nil)

        world.model.toggle(.reportsWaiting)
        #expect(world.model.action == "Save changes")
        // A read while the switches are being moved doesn't put them back.
        await world.model.load()
        #expect(world.model.draft == [.engineNotReady, .reportsWaiting])
        #expect(world.sets.isEmpty)
        #expect(try await world.model.apply(instance: "Livepeer") == nil)
        #expect(world.sets.last?.reason == "Save alert choices")

        world.model.toggle(.engineNotReady)
        world.model.toggle(.reportsWaiting)
        #expect(world.model.action == "Turn off alerts")
        let permitsBefore = world.device.permits
        #expect(try await world.model.apply(instance: "Livepeer") == nil)
        // Turning off asks the system nothing, sends no push token, gives the old one up and keeps the last choices.
        #expect(world.device.permits == permitsBefore)
        #expect(world.sets.last?.kinds == [])
        #expect(world.sets.last?.pushToken == nil)
        #expect(world.sets.last?.reason == "Turn off alerts")
        #expect(world.model.standing == .off)
        #expect(world.device.forgotten == 1)
        #expect(world.memory.value == AlertsMemory.Remembered(kinds: ["engine_not_ready", "reports_waiting"], registered: nil))
        #expect(world.model.draft == [.engineNotReady, .reportsWaiting])
    }

    @Test func alertsThatNoLongerReachThePhoneSaySoAndAreMendedByTurningThemBackOn() async throws {
        // The system issued a new push token since the instance was given one.
        let device = Device(permission: true)
        device.pushToken = "bb22"
        let moved = World(held: Self.alerts(.on, on: Set(Self.all)), device: device)
        moved.memory.value = AlertsMemory.Remembered(kinds: Self.all.map(\.rawValue), registered: "aa11")
        await moved.model.load()
        #expect(moved.model.standing == .stopped)
        #expect(moved.model.summary == "Stopped")
        #expect(moved.model.action == "Turn them back on")
        #expect(try await moved.model.apply(instance: "Livepeer") == nil)
        #expect(moved.sets.last?.pushToken == "bb22")
        #expect(moved.model.standing == .on)

        // Apple told the instance the push token is dead.
        let dead = World(held: Self.alerts(.notReaching, on: [.reportsWaiting]))
        await dead.model.load()
        #expect(dead.model.standing == .stopped)
        #expect(dead.model.draft == [.reportsWaiting])

        // The same push token as before is not a change.
        let same = World(held: Self.alerts(.on, on: Set(Self.all)), device: Device(permission: true))
        same.memory.value = AlertsMemory.Remembered(kinds: Self.all.map(\.rawValue), registered: "aa11")
        await same.model.load()
        #expect(same.model.standing == .on)
    }

    @Test func thePageSaysWhenTheInstanceCantSendAndWhenSettingsStopThem() async {
        let notOffered = World(held: Self.alerts(.off, offered: false))
        await notOffered.model.load()
        #expect(notOffered.model.standing == .notOffered)
        #expect(notOffered.model.summary == "Not available")
        #expect(notOffered.model.action == nil)

        let blocked = World(held: Self.alerts(.on, on: Set(Self.all)), device: Device(permission: false))
        await blocked.model.load()
        #expect(blocked.model.standing == .blocked)
        #expect(blocked.model.summary == "Stopped")
        // Read again when the app comes back from Settings.
        blocked.device.permission = true
        await blocked.model.recheck()
        #expect(blocked.model.standing == .on)
    }

    @Test func aTestAlertSaysHowItWent() async throws {
        let world = World(held: Self.alerts(.on, on: Set(Self.all)), device: Device(permission: true))
        await world.model.load()
        #expect(world.model.tested == nil)
        #expect(try await world.model.sendTest(instance: "Livepeer") == nil)
        #expect(world.model.tested == true)
        world.testHanded = false
        _ = try await world.model.sendTest(instance: "Livepeer")
        #expect(world.model.tested == false)
        world.refusal = APIError(status: 429, message: "Three test alerts an hour. Try again later.", code: "rate_limited")
        #expect(try await world.model.sendTest(instance: "Livepeer") == "Three test alerts an hour. Try again later.")
        // Moving a switch clears what the last test said.
        world.refusal = nil
        world.model.toggle(.jobsFailing)
        #expect(world.model.tested == nil)
    }

    @Test func afterSigningInAgainTheLastChoicesAreOfferedAndAFailedReadIsSaidOnce() async {
        let world = World()
        world.memory.value = AlertsMemory.Remembered(kinds: ["reports_waiting"], registered: nil)
        await world.model.load()
        #expect(world.model.draft == [.reportsWaiting])

        let failing = World()
        failing.refusal = URLError(.notConnectedToInternet)
        await failing.model.load()
        #expect(failing.model.phase == .failed("Alerts didn't load. Check your connection."))
        // A lock or a sign-out replaces the whole console; the page has nothing to say about it.
        let locked = World()
        locked.refusal = APIError(status: 401, message: "The console is locked on this phone.", code: "locked")
        await locked.model.load()
        #expect(locked.model.phase == .loading)
        // A read that fails later keeps what was shown.
        let later = World(held: Self.alerts(.on, on: Set(Self.all)), device: Device(permission: true))
        await later.model.load()
        later.refusal = URLError(.timedOut)
        await later.model.load()
        #expect(later.model.standing == .on)
    }

    @Test func aKindThisBuildDoesntKnowIsLeftOffThePageAndNeverSent() async throws {
        var newer = Self.alerts(.off)
        newer.kinds.append(OperatorAlertChoice(kind: .unknown, label: "Something a newer instance alerts on", on: false))
        let world = World(held: newer)
        await world.model.load()
        #expect(world.model.choices.count == 3)
        _ = try await world.model.apply(instance: "Livepeer")
        #expect(world.sets.last?.kinds == ["engine_not_ready", "jobs_failing", "reports_waiting"])
    }

    @Test func whatThePhoneRemembersIsItsOwnEntryAndGoesWhenCleared() {
        let memory = AlertsMemory(vault: TokenVault(service: "org.livepeer.tests.alerts.\(UUID().uuidString)", account: TokenVault.operatorAlertsAccount))
        #expect(memory.value == AlertsMemory.Remembered())
        memory.value = AlertsMemory.Remembered(kinds: ["jobs_failing"], registered: "aa11")
        #expect(AlertsMemory(vault: memory.vault).value == AlertsMemory.Remembered(kinds: ["jobs_failing"], registered: "aa11"))
        memory.clear()
        #expect(memory.value == AlertsMemory.Remembered())
    }

    @Test func theTrayNamesTheKindsChosen() {
        let choices = Self.all.map { OperatorAlertChoice(kind: $0, label: Self.labels[$0]!, on: false) }
        #expect(AlertsModel.sentence(choices, chosen: Set(Self.all)) == "the engine stops being ready, jobs are failing or a report is waiting")
        #expect(AlertsModel.sentence(choices, chosen: [.reportsWaiting, .engineNotReady]) == "the engine stops being ready or a report is waiting")
        #expect(AlertsModel.sentence(choices, chosen: [.jobsFailing]) == "jobs are failing")
        #expect(AlertsModel.sentence(choices, chosen: []) == "")
    }

    @Test func aTappedAlertLeadsToOneOfThreePlacesAndNowhereElse() {
        #expect(AlertPlace(opens: "jobs") == .jobs)
        #expect(AlertPlace(opens: "reports") == .reports)
        #expect(AlertPlace(opens: "status") == .status)
        // Anything else, including an address, is Status.
        for other in [nil, "", "users", "https://example.test/sign-in", "more/alerts"] { #expect(AlertPlace(opens: other) == .status) }
        // Only a notification that says what kind of alert it is counts as one of the console's.
        #expect(AlertPlace(payload: ["kind": "jobs_failing", "opens": "jobs"]) == .jobs)
        #expect(AlertPlace(payload: ["kind": "phone_added"]) == .status)
        #expect(AlertPlace(payload: ["opens": "jobs"]) == nil)
        #expect(AlertPlace(payload: ["aps": ["alert": "Something else"]]) == nil)
    }

    @Test func anAlertOpensTheConsoleAtItsCoverAndIsHeardWithoutABannerOnlyWhenItIsOpen() {
        let session = ConsoleSession(vault: TokenVault(service: "org.livepeer.tests.alerts.\(UUID().uuidString)", account: TokenVault.operatorAccount), instance: InstanceStore(api: API(transport: APITransport(baseURL: BuildConfig.instanceURL, token: { nil }))))
        #expect(!session.watching)
        #expect(!session.presented)
        session.arrive(at: .reports)
        // The cover is up, and the place waits for the match.
        #expect(session.presented)
        #expect(session.stage == .signedOut)
        #expect(session.arrival == .reports)
        #expect(!session.watching)
        session.arrived()
        #expect(session.arrival == nil)
        session.hear()
        #expect(session.heard == 1)
    }
}

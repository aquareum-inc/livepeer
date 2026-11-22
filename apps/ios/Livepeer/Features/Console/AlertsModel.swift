import Foundation
import Observation

/// The system couldn't give this phone an address for alerts just now.
struct PushUnavailable: Error {}

/// The phone's side of alerts: what the system allows and the push token it gives. Nothing here talks to the
/// instance, and nothing here is asked for until the operator turns alerts on.
protocol PushDevice: AnyObject {
    /// Whether notifications from this app may show: nil when the person has never been asked.
    func allowed() async -> Bool?
    /// Asks the system whether notifications may show, the first time. Answers whether they may now.
    func permit() async -> Bool
    /// The address the system gives this phone for alerts. Throws `PushUnavailable` when it can't.
    func token() async throws -> String
    /// Gives the push token up, so nothing more can be sent to this phone even if the instance couldn't be told.
    func forget()
    /// Which of Apple's push services issued the push token: `development` or `production`.
    var environment: String { get }
}

/// What the phone remembers about its alerts, beside the console's own token and under the same protection:
/// the kinds last chosen, to offer again after the monthly sign-in, and the push token it last registered, to
/// notice when the system has issued another. Gone when the console signs out.
struct AlertsMemory {
    nonisolated struct Remembered: Codable, Equatable {
        var kinds: [String] = []
        var registered: String?
    }

    let vault: TokenVault

    init(vault: TokenVault = TokenVault(account: TokenVault.operatorAlertsAccount)) {
        self.vault = vault
    }

    var value: Remembered {
        get { vault.token.flatMap { try? JSONDecoder().decode(Remembered.self, from: Data($0.utf8)) } ?? Remembered() }
        nonmutating set { vault.set((try? JSONEncoder().encode(newValue)).map { String(decoding: $0, as: UTF8.self) }) }
    }

    func clear() { vault.set(nil) }
}

/// Alerts on this phone: read from the instance, chosen on the page, and changed only with a face or
/// fingerprint. Turning them on asks the system for a push token and hands it to the instance under a proof
/// bound to it, so nothing but this phone can point alerts elsewhere or switch them off.
@Observable
final class AlertsModel {
    enum Phase: Equatable { case loading, loaded, failed(String) }

    /// Where alerts stand on this phone, as the page says it.
    enum Standing: Equatable {
        /// Not read yet.
        case unknown
        /// The instance can't send to this kind of phone.
        case notOffered
        case off
        case on
        /// On, but notifications are switched off for the app in the phone's settings.
        case blocked
        /// They were on and no longer reach this phone: the push token changed, or Apple says it is dead.
        case stopped
    }

    private(set) var alerts: OperatorAlerts?
    private(set) var phase = Phase.loading
    /// The kinds chosen on the page. Nothing changes until they are applied with a face or fingerprint.
    private(set) var draft: Set<OperatorAlertKind> = []
    /// Whether notifications from this app may show: nil when the person has never been asked.
    private(set) var allowed: Bool?
    /// The system has issued this phone a different push token from the one the instance holds.
    private(set) var moved = false
    /// How the last test alert went: true when the instance handed it over.
    private(set) var tested: Bool?
    /// Counts confirmed changes, for the one haptic each gets.
    private(set) var changes = 0

    private let device: PushDevice
    private let memory: AlertsMemory
    private let read: () async throws -> OperatorAlerts
    /// Sets the kinds and the push token, confirmed with a match under `reason`. No kinds turns alerts off.
    private let set: (_ kinds: [String], _ pushToken: String?, _ reason: String) async throws -> OperatorAlerts
    /// Sends this phone a test alert, confirmed with a match. True when the instance handed it over.
    private let test: () async throws -> Bool

    init(device: PushDevice, memory: AlertsMemory, read: @escaping () async throws -> OperatorAlerts, set: @escaping (_ kinds: [String], _ pushToken: String?, _ reason: String) async throws -> OperatorAlerts, test: @escaping () async throws -> Bool) {
        self.device = device
        self.memory = memory
        self.read = read
        self.set = set
        self.test = test
    }

    /// The choices this build knows how to name.
    var choices: [OperatorAlertChoice] { (alerts?.kinds ?? []).filter { $0.kind != .unknown } }

    private var on: Set<OperatorAlertKind> { Set(choices.filter(\.on).map(\.kind)) }

    var standing: Standing {
        guard let alerts else { return .unknown }
        if !alerts.offered { return .notOffered }
        switch alerts.state {
        case .off, .unknown: return .off
        case .notReaching: return .stopped
        case .on: return moved ? .stopped : allowed == false ? .blocked : .on
        }
    }

    /// Whether the switches differ from what the instance holds while alerts are on.
    var edited: Bool { alerts?.state == .on && draft != on }

    /// The page's one action, or none when there is nothing to apply.
    var action: String? {
        switch standing {
        case .off: draft.isEmpty ? nil : "Turn on alerts"
        case .stopped: draft.isEmpty ? nil : "Turn them back on"
        case .on, .blocked: !edited ? nil : draft.isEmpty ? "Turn off alerts" : "Save changes"
        case .unknown, .notOffered: nil
        }
    }

    /// A few words for the row on More.
    var summary: String {
        switch standing {
        case .unknown: ""
        case .notOffered: "Not available"
        case .off: "Off"
        case .on: "On · \(on.count) of \(choices.count)"
        case .blocked, .stopped: "Stopped"
        }
    }

    func load() async {
        do {
            let fresh = try await read()
            let remembered = memory.value
            // Only a phone whose alerts are on has a push token to compare, and asking for one otherwise would make one.
            var current: String?
            if fresh.state == .on, remembered.registered != nil { current = try? await device.token() }
            let wasEdited = alerts != nil && edited
            alerts = fresh
            phase = .loaded
            allowed = await device.allowed()
            moved = current != nil && current != remembered.registered
            // The switches follow the instance until someone has moved one.
            if !wasEdited { draft = Self.chosen(fresh, remembered) }
        } catch is CancellationError {
            return
        } catch {
            if let refusal = error as? APIError, refusal.status == 401 { return }
            if alerts == nil { phase = .failed((error as? APIError)?.message ?? "Alerts didn't load. Check your connection.") }
        }
    }

    /// What the phone's own settings say now: read again when the app comes back from them.
    func recheck() async { allowed = await device.allowed() }

    func toggle(_ kind: OperatorAlertKind) {
        if draft.contains(kind) { draft.remove(kind) } else { draft.insert(kind) }
        tested = nil
    }

    /// Applies the switches: turns alerts on, changes which are on, or with none chosen turns them off. Nil when
    /// done; otherwise why not. Nothing is sent to the instance unless notifications may show and the system
    /// has given a push token. Throws `CancellationError` when the person closes the face or fingerprint prompt.
    func apply(instance: String) async throws -> String? {
        let kinds = choices.map(\.kind).filter(draft.contains)
        guard !kinds.isEmpty else { return try await turnOff(instance: instance) }
        return try await change(instance: instance) {
            guard await device.permit() else { return "Notifications are off for \(instance) in Settings, so alerts can't show." }
            guard let pushToken = try? await device.token() else { return "This phone couldn't be given an address for alerts. Check your connection and try again." }
            let answer = try await set(kinds.map(\.rawValue), pushToken, standing == .on ? "Save alert choices" : "Turn on alerts")
            memory.value = AlertsMemory.Remembered(kinds: kinds.map(\.rawValue), registered: pushToken)
            await settle(answer)
            return nil
        }
    }

    /// Turns alerts off on the instance, then gives the push token up. The choices are kept to offer again.
    func turnOff(instance: String) async throws -> String? {
        try await change(instance: instance) {
            let answer = try await set([], nil, "Turn off alerts")
            var remembered = memory.value
            remembered.registered = nil
            memory.value = remembered
            device.forget()
            await settle(answer)
            return nil
        }
    }

    /// Sends this phone a test alert. The page says how it went; nothing else changes.
    func sendTest(instance: String) async throws -> String? {
        try await change(instance: instance) {
            tested = try await test()
            await load()
            return nil
        }
    }

    private func settle(_ answer: OperatorAlerts) async {
        alerts = answer
        phase = .loaded
        allowed = await device.allowed()
        moved = false
        tested = nil
        draft = Self.chosen(answer, memory.value)
        changes += 1
    }

    /// Runs a change and says in words why it didn't happen. A closed prompt is passed on, and says nothing.
    private func change(instance: String, _ run: () async throws -> String?) async throws -> String? {
        do {
            return try await run()
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            return ConsoleSession.changeMessage(for: error, instance: instance)
        }
    }

    /// What the switches show: what is on; or, while alerts are off, what was chosen last time, or everything.
    private static func chosen(_ alerts: OperatorAlerts, _ remembered: AlertsMemory.Remembered) -> Set<OperatorAlertKind> {
        let known = alerts.kinds.map(\.kind).filter { $0 != .unknown }
        let on = Set(alerts.kinds.filter { $0.on && $0.kind != .unknown }.map(\.kind))
        if alerts.state != .off, !on.isEmpty { return on }
        let before = Set(known.filter { remembered.kinds.contains($0.rawValue) })
        return before.isEmpty ? Set(known) : before
    }

    /// "the engine stops being ready, jobs are failing or a report is waiting": the chosen kinds as the tray says them.
    nonisolated static func sentence(_ choices: [OperatorAlertChoice], chosen: Set<OperatorAlertKind>) -> String {
        let parts = choices.filter { chosen.contains($0.kind) }.map { $0.label.prefix(1).lowercased() + $0.label.dropFirst() }
        guard let last = parts.last else { return "" }
        return parts.count == 1 ? last : parts.dropLast().joined(separator: ", ") + " or " + last
    }
}

/// Where a tapped alert leads. An alert carries its kind and one of three places, and nothing else: never an
/// address to open. Anything this build doesn't know is Status.
nonisolated enum AlertPlace: Equatable, Sendable {
    case status, jobs, reports

    init(opens: String?) {
        switch opens {
        case "jobs": self = .jobs
        case "reports": self = .reports
        default: self = .status
        }
    }

    /// The place an alert's payload points at, or nil when the notification isn't one of the console's alerts.
    init?(payload: [AnyHashable: Any]) {
        guard let kind = payload["kind"] as? String, !kind.isEmpty else { return nil }
        self.init(opens: payload["opens"] as? String)
    }
}

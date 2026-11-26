import AuthenticationServices
import CryptoKit
import SwiftUI

/// The operator's console on this phone: its own session, apart from the user's. Signing in enrols a key made
/// in the phone's secure hardware; the console then opens for a few minutes at a time, each time after a face or
/// fingerprint match. The token alone reads nothing.
@Observable
final class ConsoleSession {
    enum Stage: Equatable {
        /// This phone has no console session.
        case signedOut
        /// It has one, and reading needs a new match.
        case locked
        case open
    }

    private(set) var stage: Stage
    /// Whether the console covers the app.
    private(set) var presented = false
    /// Signing in or unlocking is under way.
    private(set) var working = false
    /// Why the last sign-in or unlock didn't finish, in words to show.
    private(set) var failure: String?
    /// Counts each unlock, so screens read again when the console reopens.
    private(set) var unlocks = 0
    /// Counts changes the instance refused because this operator's role no longer allows them, so the console
    /// asks again what their role is.
    private(set) var roleRefusals = 0
    /// Where a tapped alert points, until the console has gone there.
    private(set) var arrival: AlertPlace?
    /// Counts alerts that arrived while the console was open, so Status reads itself again and no banner is needed.
    private(set) var heard = 0
    /// Called when the session has ended on this phone, however it ended: what was kept beside it goes too.
    var onForgotten: () -> Void = {}

    private let api: OperatorAPI<ConsoleTransport>
    private let vault: TokenVault
    private let key: DeviceKey
    private let instance: InstanceStore
    private var relock: Task<Void, Never>?
    private var leftAt: Date?

    /// How long the app can be in the background before the console locks itself.
    private static let awayLimit: TimeInterval = 60
    /// The longest the console stays open on one match, whatever the instance says.
    private static let longestOpen: TimeInterval = 300

    init(vault: TokenVault = TokenVault(account: TokenVault.operatorAccount), key: DeviceKey = DeviceKey(), instance: InstanceStore) {
        self.vault = vault
        self.key = key
        self.instance = instance
        api = OperatorAPI(session: ConsoleTransport(baseURL: BuildConfig.instanceURL, token: { vault.token }))
        stage = vault.token == nil ? .signedOut : .locked
        watchForLeaving()
    }

    /// Whether to show someone the way in: they are signed in as a person who runs the instance, and the instance
    /// serves its console to phones. Offering is not access: the instance decides that at the console's own
    /// sign-in and on every request.
    nonisolated static func offered(to me: Me?, by instance: InstanceDescription?) -> Bool {
        me?.role == .operator && instance?.surfaces.mobileConsole == true
    }

    /// This phone has a console session, locked or open.
    var enrolled: Bool { stage != .signedOut }

    /// Whether the console is open in front of the person: an alert then needs no banner.
    var watching: Bool { presented && stage == .open }

    /// An alert arrived while the console was open.
    func hear() { heard += 1 }

    /// An alert was tapped. The console comes up on its cover and asks for the match; the place the alert points
    /// at is gone to once it is open. Nothing else comes of a tap.
    func arrive(at place: AlertPlace) {
        arrival = place
        if !watching { present() }
    }

    func arrived() { arrival = nil }

    /// Covers the app with the console, asking for a match at once when this phone is already enrolled.
    func present() {
        failure = nil
        presented = true
        if stage == .locked { Task { await unlock() } }
    }

    /// Back to the app. The console locks behind it.
    func dismiss() {
        lock()
        presented = false
    }

    func lock() {
        relock?.cancel()
        relock = nil
        if stage == .open { stage = .locked }
    }

    /// Locks the console when the app comes back from more than a minute in the background. The system's own
    /// notices are used, not the scene phase: a view may not hear of the background until the app returns.
    private func watchForLeaving() {
        let centre = NotificationCenter.default
        centre.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.leftAt = .now }
        }
        centre.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.returned() }
        }
    }

    private func returned() {
        if let leftAt, Date.now.timeIntervalSince(leftAt) > Self.awayLimit { lock() }
        leftAt = nil
    }

    /// One change, confirmed: the instance gives a nonce for exactly this operation and input, the phone's key
    /// signs it after a new face or fingerprint match, and the change is sent with that proof. Nothing here
    /// assumes the change happened: the caller updates the screen from the instance's answer. Throws
    /// `CancellationError` when the person closes the prompt.
    func confirm<Output: Sendable>(_ operation: String, input: [String: JSONValue], reason: String, _ change: (OperatorAPI<ConsoleTransport>, OperatorProof) async throws -> Output) async throws -> Output {
        do {
            let challenge = try await api.createOperatorChallenge(purpose: operation, inputHash: try OperatorProofs.inputHash(input))
            let message = OperatorProofs.confirmMessage(nonce: challenge.nonce, operation: operation, inputHash: try OperatorProofs.inputHash(input))
            let signature: String
            do {
                signature = try await key.sign(message, reason: reason)
            } catch DeviceKey.Failure.cancelled {
                throw CancellationError()
            } catch DeviceKey.Failure.gone {
                forget()
                failure = "This phone's console key is gone. Sign in again."
                throw DeviceKey.Failure.gone
            }
            return try await change(api, OperatorProof(nonce: challenge.nonce, signature: signature))
        } catch let error as APIError {
            refused(error)
            throw error
        }
    }

    /// Why a change didn't happen, in words to show under it.
    static func changeMessage(for error: Error, instance: String) -> String {
        switch error {
        case let error as APIError: error.message
        case is URLError: "Can't reach \(instance). Nothing was changed."
        case DeviceKey.Failure.unavailable: needsBiometrics
        default: "That wasn't confirmed, so nothing was changed. Try again."
        }
    }

    /// Starting over: what went wrong last time has been read.
    func clearFailure() { failure = nil }

    /// Signs this phone out of the console: ends the session on the instance, then drops the token and the key.
    /// Signed out here even when the instance can't be reached.
    func signOut() async {
        _ = try? await api.deleteOperatorDeviceSession()
        forget()
        failure = nil
    }

    /// One of the console's reads. A refusal that locks or ends the session changes the console at once.
    func read<Output: Sendable>(_ request: (OperatorAPI<ConsoleTransport>) async throws -> Output) async throws -> Output {
        do {
            return try await request(api)
        } catch let error as APIError {
            refused(error)
            throw error
        }
    }

    /// Signs in with one of the instance's own methods in the system's auth session, enrols this phone's key,
    /// then opens the console. The instance asks the provider for a new sign-in and refuses anyone it doesn't
    /// mark as an operator.
    func signIn(with method: SignInMethodName, email: String? = nil, using web: WebAuthenticationSession) async {
        guard !working else { return }
        working = true
        failure = nil
        do {
            try await enrol(with: method, email: email, using: web)
        } catch is CancellationError {
            working = false
            return
        } catch {
            key.delete()
            failure = Self.signInMessage(for: error, instance: instance.name)
            working = false
            return
        }
        working = false
        await unlock()
    }

    /// Asks the instance for a nonce, has the phone's key sign it after a match, and opens the console.
    func unlock() async {
        guard stage == .locked, !working else { return }
        working = true
        failure = nil
        defer { working = false }
        do {
            let challenge = try await api.createOperatorChallenge(purpose: "unlock")
            let signature = try await key.sign(OperatorProofs.unlockMessage(nonce: challenge.nonce), reason: "Unlock the console")
            let unlocked = try await api.unlockOperatorDeviceSession(nonce: challenge.nonce, signature: signature)
            opened(until: ConsoleFormat.date(unlocked.unlockedUntil))
        } catch DeviceKey.Failure.cancelled {
            return
        } catch DeviceKey.Failure.gone {
            forget()
            failure = "This phone's console key is gone. Sign in again."
        } catch DeviceKey.Failure.unavailable {
            failure = Self.needsBiometrics
        } catch let error as APIError {
            refused(error)
            if stage != .signedOut { failure = error.message }
        } catch is URLError {
            failure = "Can't reach \(instance.name). Check your connection."
        } catch {
            failure = "The console didn't unlock. Try again."
        }
    }

    private func enrol(with method: SignInMethodName, email: String?, using web: WebAuthenticationSession) async throws {
        guard DeviceKey.biometry != nil else { throw DeviceKey.Failure.unavailable }
        let publicKey = try key.create()
        let verifier = Account.randomText(bytes: 32)
        let state = Account.randomText(bytes: 16)
        let scheme = (Bundle.main.bundleIdentifier ?? "").lowercased()

        var start = URLComponents(url: BuildConfig.instanceURL.appending(path: "auth/start"), resolvingAgainstBaseURL: false)!
        start.queryItems = [
            URLQueryItem(name: "method", value: method.rawValue),
            URLQueryItem(name: "purpose", value: "operator"),
            URLQueryItem(name: "client", value: "ios"),
            URLQueryItem(name: "challenge", value: Data(SHA256.hash(data: Data(verifier.utf8))).base64URL),
            URLQueryItem(name: "state", value: state),
        ] + (email.map { [URLQueryItem(name: "email", value: $0)] } ?? [])
        let callback: URL
        do {
            callback = try await web.authenticate(using: start.url!, callback: .customScheme(scheme), additionalHeaderFields: [:])
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            throw CancellationError()
        }
        let values = Dictionary(URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.map { ($0.name, $0.value ?? "") } ?? [], uniquingKeysWith: { first, _ in first })
        guard values["state"] == state else { throw SignInRefusal(reason: "failed") }
        if let reason = values["error"] { throw SignInRefusal(reason: reason) }
        guard values["purpose"] == "operator", let code = values["code"] else { throw SignInRefusal(reason: "failed") }

        let issued = try await api.createOperatorDeviceSession(code: code, verifier: verifier, platform: "ios", publicKey: publicKey, deviceName: UIDevice.current.name)
        vault.set(issued.token)
        stage = .locked
    }

    /// The instance sent the person back without a code, and said why.
    struct SignInRefusal: Error { let reason: String }

    static let needsBiometrics = "The console needs Face ID or Touch ID. Set one up in Settings, or use the console on the web."

    static func signInMessage(for error: Error, instance: String) -> String {
        switch error {
        case DeviceKey.Failure.unavailable: return needsBiometrics
        case let refusal as SignInRefusal:
            switch refusal.reason {
            case "not_operator": return "This account doesn't run \(instance)."
            case "mobile_console_off": return "\(instance) doesn't offer its console on phones."
            case "method": return "That way of signing in isn't offered here."
            case "closed": return "\(instance) isn't taking new accounts."
            default: return "Sign-in didn't finish. Try again."
            }
        case let error as APIError: return error.message
        default: return "Sign-in didn't finish. Check your connection and try again."
        }
    }

    private func opened(until: Date?) {
        stage = .open
        unlocks += 1
        let seconds = min(max(until?.timeIntervalSinceNow ?? Self.longestOpen, 1), Self.longestOpen)
        relock?.cancel()
        relock = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            self?.lock()
        }
    }

    private func refused(_ error: APIError) {
        if error.code == "locked" {
            lock()
        } else if error.code == "proof_required" {
            // The change was refused and the session stands; the caller says so.
            return
        } else if error.code == "role" {
            // Their role on the team changed since Status last answered. The caller says so; Status is asked again.
            roleRefusals += 1
        } else if error.status == 401 || error.code == "mobile_console_off" || error.code == "operator_session" {
            forget()
            if error.code == "mobile_console_off" {
                failure = "\(instance.name) doesn't offer its console on phones."
                Task { await instance.refresh() }
            } else {
                failure = "The console was signed out on this phone. Sign in again."
            }
        }
    }

    /// The session is over on the instance: drop the token and the key it was bound to.
    private func forget() {
        relock?.cancel()
        relock = nil
        vault.set(nil)
        key.delete()
        stage = .signedOut
        onForgotten()
    }
}

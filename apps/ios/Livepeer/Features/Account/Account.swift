import AuthenticationServices
import CryptoKit
import SwiftUI

/// Carries refusals from the transport, which runs anywhere, to the account, which lives on the main actor.
nonisolated final class RefusalRelay: Sendable {
    let refusals: AsyncStream<Refusal>
    private let continuation: AsyncStream<Refusal>.Continuation

    init() { (refusals, continuation) = AsyncStream.makeStream() }
    func send(_ refusal: Refusal) { continuation.yield(refusal) }
}

/// Who is using the app: a guest, or a person signed in with a device session of their own.
///
/// Sign-in runs in the system's auth session, never a web view. The instance hands a one-time code back to
/// this app's own address, and the app exchanges it with the PKCE verifier only it holds for a device session.
@Observable
final class Account {
    /// An open sign-in tray, and what it's for.
    struct Prompt: Identifiable {
        let id = UUID()
        let reason: String?
    }

    private(set) var signedIn: Bool
    private(set) var me: Me?
    /// The accounts the person can work in: their own and the workspaces they belong to. Nil until read.
    private(set) var accounts: AccountList?
    /// The account being switched to, while the instance is asked.
    private(set) var switchingTo: String?
    /// Goes up each time the app starts working in a different account, so everything on screen is read again.
    private(set) var accountEpoch = 0
    /// Something to tell the person once, such as "You've been signed out."
    var notice: String?
    /// The sign-in tray, when it's open.
    var prompt: Prompt?
    private var waiting: CheckedContinuation<Bool, Never>?
    private let api: API
    private let vault: TokenVault
    private let instance: InstanceStore

    init(api: API, vault: TokenVault, relay: RefusalRelay, instance: InstanceStore) {
        self.api = api
        self.vault = vault
        self.instance = instance
        signedIn = vault.token != nil
        Task { [weak self] in
            for await refusal in relay.refusals { await self?.handle(refusal) }
        }
    }

    /// The initials on the account button.
    var initials: String {
        let words = (me?.name ?? "").split(separator: " ").prefix(2)
        return words.compactMap(\.first).map(String.init).joined().uppercased()
    }

    /// The workspace the app is working in, or nil in the person's own account.
    var workspace: AccountSummary? { me.flatMap { $0.account.kind == .workspace ? $0.account : nil } }

    /// Whether there is anything to switch between.
    var hasWorkspaces: Bool { (accounts?.accounts.count ?? 0) > 1 }

    func refresh() async {
        guard signedIn else { return }
        guard let fresh = try? await api.getMe() else { return }
        // The account can change under the app: a switch here, or being removed from a workspace elsewhere.
        if let before = me?.account.id, before != fresh.account.id { accountEpoch += 1 }
        me = fresh
    }

    /// Reads the accounts the person can work in. What was known stays if the instance can't be reached.
    func loadAccounts() async {
        guard signedIn else { return }
        if let fresh = try? await api.listAccounts() { accounts = fresh }
    }

    /// Starts working in another account. False when the instance refused or couldn't be reached.
    func switchAccount(to id: String) async -> Bool {
        guard signedIn, switchingTo == nil, id != me?.account.id else { return id == me?.account.id }
        switchingTo = id
        defer { switchingTo = nil }
        guard let fresh = try? await api.switchAccount(accountId: id) else { return false }
        accounts = fresh
        await refresh()
        return me?.account.id == id
    }

    /// Opens the sign-in tray and waits for it. True once signed in, false if the person closed it. Whatever
    /// asked carries on from where it was.
    func requireSignIn(_ reason: String? = nil) async -> Bool {
        if signedIn { return true }
        finishPrompt(false)
        return await withCheckedContinuation { continuation in
            waiting = continuation
            prompt = Prompt(reason: reason)
        }
    }

    /// The sign-in tray closed, however it closed.
    func promptClosed() { finishPrompt(signedIn) }

    private func finishPrompt(_ done: Bool) {
        prompt = nil
        waiting?.resume(returning: done)
        waiting = nil
    }

    enum SignInError: LocalizedError {
        case notOffered, mobileOff, unfinished
        var errorDescription: String? {
            switch self {
            case .notOffered: "That way of signing in isn't offered here."
            case .mobileOff: "This service doesn't offer its app on phones right now."
            case .unfinished: "Sign-in didn't finish. Try again."
            }
        }
    }

    /// Signs in with a method the instance offers, in the system's auth session.
    func signIn(with method: SignInMethodName, email: String? = nil, using session: WebAuthenticationSession) async throws {
        let verifier = Self.randomText(bytes: 32)
        let state = Self.randomText(bytes: 16)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
        let scheme = (Bundle.main.bundleIdentifier ?? "").lowercased()

        var start = URLComponents(url: BuildConfig.instanceURL.appending(path: "auth/start"), resolvingAgainstBaseURL: false)!
        start.queryItems = [
            URLQueryItem(name: "method", value: method.rawValue),
            URLQueryItem(name: "client", value: "ios"),
            URLQueryItem(name: "challenge", value: challenge),
            URLQueryItem(name: "state", value: state),
        ] + (email.map { [URLQueryItem(name: "email", value: $0)] } ?? [])

        let callback: URL
        do {
            callback = try await session.authenticate(using: start.url!, callback: .customScheme(scheme), additionalHeaderFields: [:])
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            throw CancellationError()
        }
        let values = Dictionary(URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.map { ($0.name, $0.value ?? "") } ?? [], uniquingKeysWith: { first, _ in first })
        guard values["state"] == state else { throw SignInError.unfinished }
        switch values["error"] {
        case "method": throw SignInError.notOffered
        case "mobile_off":
            await instance.refresh()
            throw SignInError.mobileOff
        case .some: throw SignInError.unfinished
        case nil: break
        }
        guard let code = values["code"] else { throw SignInError.unfinished }

        let issued = try await api.createDeviceSession(code: code, verifier: verifier, platform: "ios", deviceName: UIDevice.current.name)
        vault.set(issued.token)
        signedIn = true
        notice = nil
        finishPrompt(true)
        await refresh()
    }

    /// Ends this device's session on the instance, then forgets it here. Signed out here even when offline.
    func signOut() async {
        _ = try? await api.endDeviceSession()
        forget()
    }

    /// Deletes the account on the instance, then forgets it here. False when the instance didn't.
    func deleteAccount() async -> Bool {
        guard (try? await api.deleteAccount()) != nil else { return false }
        forget()
        notice = "Your account was deleted."
        return true
    }

    /// Joins the workspace an invitation is for and starts working in it. False when the instance refused.
    func acceptInvitation(_ invitation: AccountInvitation) async -> Bool {
        guard signedIn, let fresh = try? await api.acceptInvitation(id: invitation.id) else { return false }
        accounts = fresh
        await refresh()
        return true
    }

    /// Declines an invitation. It leaves the list. False when the instance refused.
    func declineInvitation(_ invitation: AccountInvitation) async -> Bool {
        guard signedIn, let fresh = try? await api.declineInvitation(id: invitation.id) else { return false }
        accounts = fresh
        return true
    }

    private func forget() {
        vault.set(nil)
        signedIn = false
        me = nil
        accounts = nil
    }

    private func handle(_ refusal: Refusal) async {
        if refusal.error.isMobileOff {
            await instance.refresh()
        } else if refusal.token == vault.token {
            forget()
            notice = "You've been signed out."
        }
    }

    static func randomText(bytes count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return Data(bytes).base64URL
    }
}

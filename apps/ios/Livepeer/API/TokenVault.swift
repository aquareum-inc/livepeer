import Foundation
import Security
import Synchronization

/// Holds one session token: in the Keychain, on this device only (never in a backup or on another device), with
/// a copy in memory for the transport to read on any thread. The user's device session and the operator's
/// console session are separate entries, and neither can stand in for the other.
nonisolated final class TokenVault: Sendable {
    private let current: Mutex<String?>
    private let service: String
    private let account: String
    /// Whether it can be read only while the phone is unlocked, rather than any time after the first unlock.
    private let whileUnlockedOnly: Bool

    /// The user's device session: readable after the first unlock, so work can be followed in the background.
    static let userAccount = "device-session"
    /// The operator's console session: readable only while the phone is unlocked.
    static let operatorAccount = "operator-device-session"

    init(service: String = Bundle.main.bundleIdentifier ?? "org.livepeer.app", account: String = TokenVault.userAccount) {
        self.service = service
        self.account = account
        whileUnlockedOnly = account == Self.operatorAccount
        current = Mutex(Self.read(service: service, account: account))
    }

    var token: String? { current.withLock { $0 } }

    /// Stores a new token, or removes it with nil.
    func set(_ token: String?) {
        current.withLock { $0 = token }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
        guard let token else { return }
        var item = query
        item[kSecValueData as String] = Data(token.utf8)
        item[kSecAttrAccessible as String] = whileUnlockedOnly ? kSecAttrAccessibleWhenUnlockedThisDeviceOnly : kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    private static func read(service: String, account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

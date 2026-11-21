import Foundation
import LocalAuthentication
import Security

/// The console's key on this phone: a P-256 private key made in the Secure Enclave, which never leaves it and
/// signs only after a face or fingerprint match. Changing the phone's enrolled faces or fingerprints destroys it.
/// There is no passcode fallback.
nonisolated struct DeviceKey: Sendable {
    enum Failure: Error, Equatable {
        /// The phone has no face or fingerprint enrolled, or no secure hardware.
        case unavailable
        /// The person closed the prompt.
        case cancelled
        /// The key is no longer there: never made, or destroyed when the enrolled biometrics changed.
        case gone
        case failed
    }

    let tag: Data

    init(tag: String = (Bundle.main.bundleIdentifier ?? "org.livepeer.app") + ".operator-device-key") {
        self.tag = Data(tag.utf8)
    }

    /// What the phone unlocks with, in words: "Face ID", "Touch ID" or "Optic ID"; nil when nothing is enrolled.
    static var biometry: String? {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else { return nil }
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return nil
        }
    }

    #if targetEnvironment(simulator)
    /// The simulator has no Secure Enclave to hold a key behind a face, and refuses to make one. There the key
    /// is made without that condition and `sign` asks for the match itself, so the console runs as it does on a
    /// phone. This is never compiled into a build for a device.
    private static let protection: SecAccessControlCreateFlags = [.privateKeyUsage]
    #else
    private static let protection: SecAccessControlCreateFlags = [.privateKeyUsage, .biometryCurrentSet]
    #endif

    /// Makes a new key, replacing any earlier one, and answers with its public half: base64 of the 65-byte
    /// uncompressed point, as the instance stores it.
    func create() throws -> String {
        delete()
        guard Self.biometry != nil,
              let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, Self.protection, nil)
        else { throw Failure.unavailable }
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: tag,
                kSecAttrAccessControl as String: access,
            ],
        ]
        guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, nil),
              let publicKey = SecKeyCopyPublicKey(key),
              let point = SecKeyCopyExternalRepresentation(publicKey, nil) as Data?
        else { throw Failure.unavailable }
        return point.base64EncodedString()
    }

    /// Signs the message after the system has matched a face or fingerprint, showing `reason` where the prompt
    /// has room for it. The signature is DER, base64url. Waits for the person, so it runs off the main thread.
    func sign(_ message: String, reason: String) async throws -> String {
        let tag = tag
        return try await Task.detached {
            let context = LAContext()
            context.localizedReason = reason
            #if targetEnvironment(simulator)
            do {
                try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason)
            } catch let error as LAError where [.userCancel, .appCancel, .systemCancel].contains(error.code) {
                throw Failure.cancelled
            } catch let error as LAError where [.biometryNotEnrolled, .biometryNotAvailable].contains(error.code) {
                throw Failure.unavailable
            } catch {
                throw Failure.failed
            }
            #endif
            let query: [String: Any] = [
                kSecClass as String: kSecClassKey,
                kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
                kSecAttrApplicationTag as String: tag,
                kSecReturnRef as String: true,
                kSecUseAuthenticationContext as String: context,
            ]
            var found: CFTypeRef?
            guard SecItemCopyMatching(query as CFDictionary, &found) == errSecSuccess, let found, CFGetTypeID(found) == SecKeyGetTypeID() else { throw Failure.gone }
            let key = found as! SecKey
            var error: Unmanaged<CFError>?
            guard let signature = SecKeyCreateSignature(key, .ecdsaSignatureMessageX962SHA256, Data(message.utf8) as CFData, &error) as Data? else {
                let code = error.map { CFErrorGetCode($0.takeRetainedValue()) }
                switch code {
                case LAError.userCancel.rawValue, LAError.appCancel.rawValue, LAError.systemCancel.rawValue: throw Failure.cancelled
                case LAError.biometryNotEnrolled.rawValue, LAError.biometryNotAvailable.rawValue: throw Failure.unavailable
                default: throw Failure.failed
                }
            }
            return signature.base64URL
        }.value
    }

    func delete() {
        SecItemDelete([kSecClass as String: kSecClassKey, kSecAttrApplicationTag as String: tag] as CFDictionary)
    }
}

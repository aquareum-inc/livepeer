import CryptoKit
import Foundation

/// What the phone's key signs for the console, and how an operation's input is hashed. The instance builds the
/// same text and the same hash; `docs/mobile/fixtures/operator_proof_vectors.json` holds both sides to it.
nonisolated enum OperatorProofs {
    /// Signed to open the console for reading.
    static func unlockMessage(nonce: String) -> String {
        "livepeer-operator-unlock\n\(nonce)"
    }

    /// Signed to confirm one change: bound to the operation and to exactly this input.
    static func confirmMessage(nonce: String, operation: String, inputHash: String) -> String {
        "livepeer-operator-confirm\n\(nonce)\n\(operation)\n\(inputHash)"
    }

    /// The input as JSON with its keys in order and no spacing.
    static func canonical(_ input: [String: JSONValue]) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return String(decoding: try encoder.encode(input), as: UTF8.self)
    }

    /// base64url, without padding, of the SHA-256 of the canonical input.
    static func inputHash(_ input: [String: JSONValue]) throws -> String {
        Data(SHA256.hash(data: Data(try canonical(input).utf8))).base64URL
    }
}

nonisolated extension Data {
    /// base64url without padding, as the instance reads nonces, hashes and signatures.
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

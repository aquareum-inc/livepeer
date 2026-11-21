package org.livepeer.app.api

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import java.security.MessageDigest
import java.util.Base64

/**
 * What the phone's key signs for the console, and how an operation's input is hashed. The instance builds the
 * same text and the same hash; `docs/mobile/fixtures/operator_proof_vectors.json` holds both sides to it.
 */
object OperatorProofs {
    /** Signed to open the console for reading. */
    fun unlockMessage(nonce: String): String = "livepeer-operator-unlock\n$nonce"

    /** Signed to confirm one change: bound to the operation and to exactly this input. */
    fun confirmMessage(nonce: String, operation: String, inputHash: String): String = "livepeer-operator-confirm\n$nonce\n$operation\n$inputHash"

    /** The input as JSON with its keys in order and no spacing. */
    fun canonical(input: Map<String, JsonElement>): String = ordered(JsonObject(input)).toString()

    /** base64url, without padding, of the SHA-256 of the canonical input. */
    fun inputHash(input: Map<String, JsonElement>): String = base64Url(MessageDigest.getInstance("SHA-256").digest(canonical(input).toByteArray()))

    /** base64url without padding, as the instance reads nonces, hashes and signatures. */
    fun base64Url(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

    private fun ordered(element: JsonElement): JsonElement = when (element) {
        is JsonObject -> JsonObject(element.toSortedMap().mapValues { ordered(it.value) })
        is JsonArray -> JsonArray(element.map(::ordered))
        else -> element
    }
}

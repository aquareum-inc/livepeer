// Generated from docs/mobile/openapi.json by packages/mobile-codegen.
// Do not edit: change apps/web/lib/public-api/operations.ts or the API client's types and run `pnpm mobile:generate`.

package org.livepeer.app.generated

import kotlinx.serialization.DeserializationStrategy
import org.livepeer.app.api.ApiTransport
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

/**
 * A confirmation of one change: the nonce the instance gave for exactly that operation and input, and the
 * phone key's signature over it, made after a face or fingerprint. Good once, for 60 seconds.
 */
data class OperatorProof(val nonce: String, val signature: String) {
    /** The value of the X-Operator-Proof header. */
    val header: String get() = "$nonce.$signature"
}

/**
 * What carries the console's requests: the operator device session's token, and a proof when there is one.
 * Only the console's own session implements it; the user app's transport does not.
 */
interface OperatorTransport {
    suspend fun <T> send(output: DeserializationStrategy<T>, method: String, path: String, query: Map<String, JsonElement?>, body: Map<String, JsonElement?>?, proof: OperatorProof?): T
}

/**
 * The operator console's operations a phone may call. It is made from an operator session and nothing else,
 * and every change takes a proof.
 */
@Suppress("unused")
class OperatorApi(private val transport: OperatorTransport) {
    /** Native apps: collect a finished operator sign-in with its one-time code and PKCE verifier, and enrol the phone's public key. Answers with an operator device session token, shown once. Open to guests. */
    suspend fun createOperatorDeviceSession(code: String, verifier: String, platform: String, publicKey: String, deviceName: String? = null): OperatorDeviceToken =
        transport.send(OperatorDeviceToken.serializer(), "POST", "/auth/operator-device", query = emptyMap(), body = mapOf("code" to JsonPrimitive(code), "verifier" to JsonPrimitive(verifier), "platform" to JsonPrimitive(platform), "public_key" to JsonPrimitive(publicKey), "device_name" to deviceName?.let { JsonPrimitive(it) }), proof = null)

    /** Native apps: sign this phone out of the console by ending the operator device session making the request. */
    suspend fun deleteOperatorDeviceSession(): Deleted =
        transport.send(Deleted.serializer(), "DELETE", "/auth/operator-device", query = emptyMap(), body = null, proof = null)

    /** Native apps: ask for a nonce for the phone's key to sign, to unlock the console or to confirm one change. It is good once, for 60 seconds. */
    suspend fun createOperatorChallenge(purpose: String, inputHash: String? = null): OperatorChallenge =
        transport.send(OperatorChallenge.serializer(), "POST", "/operator/device/challenge", query = emptyMap(), body = mapOf("purpose" to JsonPrimitive(purpose), "input_hash" to inputHash?.let { JsonPrimitive(it) }), proof = null)

    /** Native apps: open the console on this phone for five minutes, with the phone's signature over an unlock nonce. */
    suspend fun unlockOperatorDeviceSession(nonce: String, signature: String): OperatorUnlock =
        transport.send(OperatorUnlock.serializer(), "POST", "/operator/device/unlock", query = emptyMap(), body = mapOf("nonce" to JsonPrimitive(nonce), "signature" to JsonPrimitive(signature)), proof = null)

    /** Operator: whether anything needs attention, today's figures and the state of the service, in one answer. Needs the console unlocked on this phone. */
    suspend fun operatorStatus(): OperatorStatus =
        transport.send(OperatorStatus.serializer(), "GET", "/operator/status", query = emptyMap(), body = null, proof = null)

    /** Operator: active users, jobs today, revenue, wholesale cost and margin. Needs the console unlocked on this phone. */
    suspend fun operatorOverview(): OverviewStats =
        transport.send(OverviewStats.serializer(), "GET", "/operator/overview", query = emptyMap(), body = null, proof = null)

    /** Operator: engine readiness, discovery freshness, cost sync and version. Needs the console unlocked on this phone. */
    suspend fun operatorHealth(): EngineHealth =
        transport.send(EngineHealth.serializer(), "GET", "/operator/health", query = emptyMap(), body = null, proof = null)

    /** Operator: every account the engine knows, with its allocation. A query filters by name, label or id. Needs the console unlocked on this phone. */
    suspend fun operatorListUsers(query: String? = null): List<KnownActor> =
        transport.send(ListSerializer(KnownActor.serializer()), "GET", "/operator/users", query = mapOf("query" to query?.let { JsonPrimitive(it) }), body = null, proof = null)

    /** Operator: suspend (pause) or resume a user's allocation. Suspending also signs out their phones and tablets, and ends any console session they have on a phone. Needs its own proof: a nonce for exactly this input, signed after a face or fingerprint. */
    suspend fun operatorSetUserStatus(id: String, status: String, applicationId: String? = null, proof: OperatorProof): Done =
        transport.send(Done.serializer(), "POST", "/operator/users/${ApiTransport.escape(id)}/status", query = emptyMap(), body = mapOf("status" to JsonPrimitive(status), "application_id" to applicationId?.let { JsonPrimitive(it) }), proof = proof)

    /** Operator: recent jobs across all users, newest first, with attempts and failures. Filter by state, and page back with the created_at of the last job seen. Needs the console unlocked on this phone. */
    suspend fun operatorListJobs(limit: Double? = null, status: String? = null, before: String? = null): List<EngineJob> =
        transport.send(ListSerializer(EngineJob.serializer()), "GET", "/operator/jobs", query = mapOf("limit" to limit?.let { JsonPrimitive(it) }, "status" to status?.let { JsonPrimitive(it) }, "before" to before?.let { JsonPrimitive(it) }), body = null, proof = null)

    /** Operator: wholesale network cost by class and capability over a number of days. Needs the console unlocked on this phone. */
    suspend fun operatorCosts(days: Double? = null): CostSummary =
        transport.send(CostSummary.serializer(), "GET", "/operator/costs", query = mapOf("days" to days?.let { JsonPrimitive(it) }), body = null, proof = null)

    /** Operator: reports of shared characters, open ones first. Needs the console unlocked on this phone. */
    suspend fun operatorListReports(): List<CharacterReport> =
        transport.send(ListSerializer(CharacterReport.serializer()), "GET", "/operator/reports", query = emptyMap(), body = null, proof = null)

    /** Operator: decide a report. Dismiss leaves the character up; hide takes it off the instance for everyone. Needs its own proof: a nonce for exactly this input, signed after a face or fingerprint. */
    suspend fun operatorResolveReport(id: String, outcome: String, proof: OperatorProof): CharacterReport =
        transport.send(CharacterReport.serializer(), "POST", "/operator/reports/${ApiTransport.escape(id)}", query = emptyMap(), body = mapOf("outcome" to JsonPrimitive(outcome)), proof = proof)

    /** Operator: grants and their funding. Needs the console unlocked on this phone. */
    suspend fun operatorListGrants(): List<Grant> =
        transport.send(ListSerializer(Grant.serializer()), "GET", "/operator/grants", query = emptyMap(), body = null, proof = null)

    /** Operator: the provider's plans and allowances. Needs the console unlocked on this phone. */
    suspend fun operatorListPlans(): List<Plan> =
        transport.send(ListSerializer(Plan.serializer()), "GET", "/operator/plans", query = emptyMap(), body = null, proof = null)

    /** Operator: the compute operators that ran this instance's recent jobs, with their runners, failures and median response time. Needs the console unlocked on this phone. */
    suspend fun operatorListCompute(): List<ComputeOperator> =
        transport.send(ListSerializer(ComputeOperator.serializer()), "GET", "/operator/compute", query = emptyMap(), body = null, proof = null)

    /** Operator: every capability discovered on the network, whether this instance offers it, its markup, and how many runners are ready. Needs the console unlocked on this phone. */
    suspend fun operatorListCapabilities(): List<OfferedCapability> =
        transport.send(ListSerializer(OfferedCapability.serializer()), "GET", "/operator/capabilities", query = emptyMap(), body = null, proof = null)

    companion object {
        /** The input of operatorSetUserStatus as the instance hashes it, for createOperatorChallenge. */
        fun operatorSetUserStatusInput(id: String, status: String, applicationId: String? = null): Map<String, JsonElement> =
            mapOf("id" to JsonPrimitive(id), "status" to JsonPrimitive(status), "application_id" to applicationId?.let { JsonPrimitive(it) }).filterNotNullValues()

        /** The input of operatorResolveReport as the instance hashes it, for createOperatorChallenge. */
        fun operatorResolveReportInput(id: String, outcome: String): Map<String, JsonElement> =
            mapOf("id" to JsonPrimitive(id), "outcome" to JsonPrimitive(outcome)).filterNotNullValues()

        private fun Map<String, JsonElement?>.filterNotNullValues(): Map<String, JsonElement> = mapNotNull { (key, value) -> value?.let { key to it } }.toMap()
    }
}

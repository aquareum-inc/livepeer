package org.livepeer.app

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.livepeer.app.InstanceStore.Availability
import org.livepeer.app.api.ApiError
import org.livepeer.app.api.ApiTransport
import org.livepeer.app.api.ConsoleKey
import org.livepeer.app.api.ConsoleTransport
import org.livepeer.app.api.DeviceKeyFailure
import org.livepeer.app.api.OperatorProofs
import org.livepeer.app.api.TokenStore
import org.livepeer.app.console.ChangeOutcome
import org.livepeer.app.console.ConsoleRead
import org.livepeer.app.console.ReadState
import org.livepeer.app.console.blocked
import org.livepeer.app.console.day
import org.livepeer.app.console.factLine
import org.livepeer.app.console.fee
import org.livepeer.app.console.host
import org.livepeer.app.console.lines
import org.livepeer.app.console.marginLine
import org.livepeer.app.console.markup
import org.livepeer.app.console.money
import org.livepeer.app.console.paid
import org.livepeer.app.console.peak
import org.livepeer.app.console.periodCost
import org.livepeer.app.console.periodMargin
import org.livepeer.app.console.periodRevenue
import org.livepeer.app.console.priceLine
import org.livepeer.app.console.allowanceLine
import org.livepeer.app.console.unallocated
import org.livepeer.app.console.usd
import org.livepeer.app.generated.ComputeOperator
import org.livepeer.app.generated.ComputeOperatorStatus
import org.livepeer.app.generated.CostSummary
import org.livepeer.app.generated.Grant
import org.livepeer.app.generated.OfferedCapability
import org.livepeer.app.generated.Plan
import org.livepeer.app.console.ConsoleFormat
import org.livepeer.app.console.ConsoleSession
import org.livepeer.app.console.ConsoleSession.Stage
import org.livepeer.app.console.JobFilter
import org.livepeer.app.console.JobsModel
import org.livepeer.app.console.Phase
import org.livepeer.app.console.ReportOutcome
import org.livepeer.app.console.ReportsModel
import org.livepeer.app.console.StatusModel
import org.livepeer.app.console.StatusState
import org.livepeer.app.console.Tone
import org.livepeer.app.console.UserStatus
import org.livepeer.app.console.UsersModel
import org.livepeer.app.console.canResume
import org.livepeer.app.console.canSuspend
import org.livepeer.app.console.displayName
import org.livepeer.app.console.facts
import org.livepeer.app.console.failureFacts
import org.livepeer.app.console.offersPlace
import org.livepeer.app.console.outcome
import org.livepeer.app.console.rowKey
import org.livepeer.app.console.standing
import org.livepeer.app.console.stateLine
import org.livepeer.app.console.stateWord
import org.livepeer.app.console.summary
import org.livepeer.app.console.tone
import org.livepeer.app.console.word
import org.livepeer.app.generated.CharacterReport
import org.livepeer.app.generated.CharacterReportState
import org.livepeer.app.generated.Done
import org.livepeer.app.generated.EngineHealth
import org.livepeer.app.generated.EngineJob
import org.livepeer.app.generated.InstanceDescription
import org.livepeer.app.generated.JobState
import org.livepeer.app.generated.KnownActor
import org.livepeer.app.generated.KnownActorAllocationStatus
import org.livepeer.app.generated.Me
import org.livepeer.app.generated.MeRole
import org.livepeer.app.generated.OperatorApi
import org.livepeer.app.generated.OperatorAttentionKind
import org.livepeer.app.generated.OperatorAttentionOpens
import org.livepeer.app.generated.OperatorChallenge
import org.livepeer.app.generated.OperatorDeviceToken
import org.livepeer.app.generated.OperatorProof
import org.livepeer.app.generated.OperatorRole
import org.livepeer.app.generated.OperatorStatus
import org.livepeer.app.generated.OperatorTransport
import org.livepeer.app.generated.OperatorUnlock
import org.livepeer.app.generated.OverviewStats
import org.livepeer.app.generated.SignInMethodName
import java.io.File
import java.io.IOException
import java.time.ZoneId
import java.util.Locale

/** The operator console: what the phone signs, what it sends, how its session behaves and what its screens show. */
class ConsoleTest {
    private fun text(name: String): String = File("../../../docs/mobile/fixtures/$name.json").readText()
    private fun <T> fixture(name: String, serializer: DeserializationStrategy<T>): T = ApiTransport.json.decodeFromString(serializer, text(name))

    private val jobs = fixture("operator_list_jobs", ListSerializer(EngineJob.serializer()))
    private val failed = fixture("operator_list_jobs_failed", ListSerializer(EngineJob.serializer()))
    private val reports = fixture("operator_list_reports", ListSerializer(CharacterReport.serializer()))
    private val users = fixture("operator_list_users", ListSerializer(KnownActor.serializer()))

    // What is signed

    @Test
    fun inputsAreHashedAsTheInstanceHashesThem() {
        val vectors = ApiTransport.json.parseToJsonElement(text("operator_proof_vectors")).jsonObject
        val inputs = vectors.getValue("inputs").jsonArray
        assertTrue(inputs.size >= 6)
        for (vector in inputs) {
            val input: Map<String, JsonElement> = vector.jsonObject.getValue("input").jsonObject
            assertEquals(vector.jsonObject.getValue("canonical").jsonPrimitive.content, OperatorProofs.canonical(input))
            assertEquals(vector.jsonObject.getValue("hash").jsonPrimitive.content, OperatorProofs.inputHash(input))
        }
    }

    @Test
    fun messagesAreTheOnesTheInstanceVerifies() {
        val messages = ApiTransport.json.parseToJsonElement(text("operator_proof_vectors")).jsonObject.getValue("messages").jsonObject
        val unlock = messages.getValue("unlock").jsonObject
        assertEquals(unlock.getValue("message").jsonPrimitive.content, OperatorProofs.unlockMessage(unlock.getValue("nonce").jsonPrimitive.content))
        val confirm = messages.getValue("confirm").jsonObject
        assertEquals(
            confirm.getValue("message").jsonPrimitive.content,
            OperatorProofs.confirmMessage(confirm.getValue("nonce").jsonPrimitive.content, confirm.getValue("operation").jsonPrimitive.content, confirm.getValue("input_hash").jsonPrimitive.content),
        )
    }

    @Test
    fun theGeneratedInputsHashToTheVectors() {
        assertEquals("uIWZEHhlIibw00xq3FSaJx8jvGdKMDJa0sNZMB4wqmY", OperatorProofs.inputHash(OperatorApi.operatorResolveReportInput("rep_8Jk2", "hidden")))
        assertEquals("o5LzqdOhNXsdVCkyk6e1Qert0vG5gSC1MJFyVjN7wE4", OperatorProofs.inputHash(OperatorApi.operatorSetUserStatusInput("usr_demo_priya", "paused")))
        assertEquals("aNhWZEXNKm2UT-54tOiZE9QNvsGrN8j4X3kszjTAh68", OperatorProofs.inputHash(OperatorApi.operatorSetUserStatusInput("usr_demo_priya", "active", "default")))
        assertEquals("abc.def", OperatorProof("abc", "def").header)
    }

    // What the instance answers

    @Test
    fun theConsolesAnswersDecode() {
        assertTrue(fixture("create_operator_device_session", OperatorDeviceToken.serializer()).token.startsWith("aqo_"))
        assertTrue(fixture("create_operator_challenge", OperatorChallenge.serializer()).nonce.isNotEmpty())
        assertEquals(1795288095298, ConsoleFormat.millis(fixture("unlock_operator_device_session", OperatorUnlock.serializer()).unlockedUntil))
        assertTrue(fixture("operator_set_user_status", Done.serializer()).ok)
        assertEquals(CharacterReportState.Dismissed, fixture("operator_resolve_report", CharacterReport.serializer()).state)
        assertTrue(fixture("operator_health", EngineHealth.serializer()).version.isNotEmpty())
        assertTrue(fixture("operator_overview", OverviewStats.serializer()).activeUsers >= 0)

        val status = fixture("operator_status", OperatorStatus.serializer())
        assertEquals(OperatorAttentionKind.ReportsWaiting, status.attention.single().kind)
        assertEquals(OperatorAttentionOpens.Reports, status.attention.single().opens)
        assertEquals(38.0, status.today.jobs, 0.0)

        assertEquals(4, jobs.size)
        assertTrue(failed.all { it.state == JobState.Failed && it.failure != null })
        assertEquals(CharacterReportState.Open, reports.single().state)
        assertEquals(5, users.size)
        assertEquals(MeRole.User, fixture("get_me", Me.serializer()).role)
    }

    // What is sent

    private class Wire(private val status: Int, private val body: String) : Interceptor {
        val requests = mutableListOf<Request>()
        override fun intercept(chain: Interceptor.Chain): Response {
            requests += chain.request()
            return Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(status).message("").body(body.toResponseBody("application/json".toMediaType())).build()
        }
    }

    @Test
    fun theTransportSendsTheConsolesTokenAndAProofAndKeepsNothing() = runBlocking {
        val wire = Wire(200, text("operator_resolve_report"))
        val api = OperatorApi(ConsoleTransport("http://instance.test/", token = { "aqo_token" }, client = OkHttpClient.Builder().addInterceptor(wire).build()))

        val decided = api.operatorResolveReport("rep 1/2", "dismissed", OperatorProof("nonce", "signature"))
        assertEquals(CharacterReportState.Dismissed, decided.state)
        val change = wire.requests.single()
        assertEquals("http://instance.test/api/v1/operator/reports/rep%201%2F2", change.url.toString())
        assertEquals("Bearer aqo_token", change.header("Authorization"))
        assertEquals("nonce.signature", change.header("X-Operator-Proof"))

        val second = Wire(200, text("operator_list_jobs"))
        val listed = OperatorApi(ConsoleTransport("http://instance.test", token = { "aqo_token" }, client = OkHttpClient.Builder().addInterceptor(second).build()))
        assertEquals(4, listed.operatorListJobs(30.0, "failed", "2026-11-21T19:00:00.000Z").size)
        val read = second.requests.single()
        assertEquals("http://instance.test/api/v1/operator/jobs?before=2026-11-21T19%3A00%3A00.000Z&limit=30&status=failed", read.url.toString())
        assertNull(read.header("X-Operator-Proof"))
        assertNull(read.header("If-None-Match"))
        assertTrue(read.cacheControl.noCache)
    }

    @Test
    fun aRefusalIsThrownWithItsCode() = runBlocking {
        val wire = Wire(401, """{"error":{"status":401,"message":"The console is locked on this phone.","code":"locked"}}""")
        val api = OperatorApi(ConsoleTransport("http://instance.test", token = { null }, client = OkHttpClient.Builder().addInterceptor(wire).build()))
        try {
            api.operatorStatus()
            fail("a refusal should throw")
        } catch (error: ApiError) {
            assertEquals(401, error.status)
            assertEquals("locked", error.code)
            assertEquals("The console is locked on this phone.", error.message)
        }
        assertNull(wire.requests.single().header("Authorization"))
    }

    // The session

    private class Vault(override var token: String? = null) : TokenStore {
        override fun set(value: String?) {
            token = value
        }
    }

    private class Key(override var available: Boolean = true) : ConsoleKey {
        var exists = false
        var failure: DeviceKeyFailure.Kind? = null
        val signed = mutableListOf<Pair<String, String>>()
        override fun create(): String {
            exists = true
            return "public-key"
        }

        override suspend fun sign(message: String, reason: String): String {
            failure?.let { throw DeviceKeyFailure(it) }
            signed += message to reason
            return "signature-${signed.size}"
        }

        override fun delete() {
            exists = false
        }
    }

    /** Answers the console's requests in order of path, and records what was asked. */
    private inner class Instance : OperatorTransport {
        val calls = mutableListOf<String>()
        val bodies = mutableListOf<Map<String, JsonElement?>?>()
        val proofs = mutableListOf<OperatorProof?>()
        var refusal: ApiError? = null
        var unreachable = false
        var unlockedUntil = "2026-11-21T19:08:15.298Z"

        @Suppress("UNCHECKED_CAST")
        override suspend fun <T> send(output: DeserializationStrategy<T>, method: String, path: String, query: Map<String, JsonElement?>, body: Map<String, JsonElement?>?, proof: OperatorProof?): T {
            calls += "$method $path"
            bodies += body
            proofs += proof
            if (unreachable) throw IOException("offline")
            // The session's own operations still answer while a read is refused.
            if (path.startsWith("/operator/") && !path.startsWith("/operator/device/")) refusal?.let { throw it }
            val answer = when (path) {
                "/auth/operator-device" -> if (method == "DELETE") """{"deleted":true}""" else text("create_operator_device_session")
                "/operator/device/challenge" -> """{"nonce":"nonce-${calls.size}","expires_at":"2026-11-21T19:04:15.284Z"}"""
                "/operator/device/unlock" -> """{"unlocked_until":"$unlockedUntil"}"""
                "/operator/status" -> text("operator_status")
                else -> if (path.startsWith("/operator/reports/")) text("operator_resolve_report") else """{"ok":true}"""
            }
            return ApiTransport.json.decodeFromString(output, answer)
        }
    }

    private class Phone(val instance: OperatorTransport, val vault: Vault = Vault(), val key: Key = Key()) {
        var clock = 0L
        var refreshed = 0
        val session = ConsoleSession(
            api = OperatorApi(instance), vault = vault, key = key, scope = CoroutineScope(Dispatchers.Unconfined), baseUrl = "http://instance.test", deviceName = "Sam's Pixel",
            instanceName = { "Livepeer" }, refreshInstance = { refreshed += 1 }, now = { ConsoleFormat.millis("2026-11-21T19:03:15.298Z")!! }, elapsed = { clock },
        )

        fun query(url: String): Map<String, String> = url.substringAfter('?').split('&').associate { it.substringBefore('=') to java.net.URLDecoder.decode(it.substringAfter('='), "UTF-8") }
    }

    @Test
    fun theWayInIsOfferedOnlyToAnOperatorWhereTheConsoleIsOnPhones() {
        val me = fixture("get_me", Me.serializer())
        val instance = fixture("get_instance", InstanceDescription.serializer())
        val onPhones = instance.copy(surfaces = instance.surfaces.copy(mobileConsole = true))
        assertTrue(ConsoleSession.offered(me.copy(role = MeRole.Operator), onPhones))
        assertFalse(ConsoleSession.offered(me, onPhones))
        assertFalse(ConsoleSession.offered(me.copy(role = MeRole.Operator), instance))
        assertFalse(ConsoleSession.offered(null, onPhones))
        assertFalse(ConsoleSession.offered(me.copy(role = MeRole.Operator), null))
    }

    @Test
    fun anInstanceThatServesOnlyItsConsoleIsStillUsableAndIsTheConsole() {
        val instance = fixture("get_instance", InstanceDescription.serializer())
        val consoleOnly = instance.copy(surfaces = instance.surfaces.copy(mobile = false, mobileConsole = true))
        assertEquals(Availability.Available, InstanceStore.availability(consoleOnly, "org.livepeer.app.dev", "0.1.0"))
        assertTrue(InstanceStore.consoleOnly(consoleOnly))
        assertFalse(InstanceStore.consoleOnly(instance.copy(surfaces = instance.surfaces.copy(mobileConsole = true))))
        assertFalse(InstanceStore.consoleOnly(instance))
        assertFalse(InstanceStore.consoleOnly(null))
    }

    @Test
    fun signingInEnrolsTheKeyThenUnlocks() = runBlocking {
        val instance = Instance()
        val phone = Phone(instance)
        assertEquals(Stage.SignedOut, phone.session.stage.value)

        val sent = phone.query(phone.session.start(SignInMethodName.Email, "sam@example.test")!!)
        assertEquals("operator", sent["purpose"])
        assertEquals("android", sent["client"])
        assertEquals("email", sent["method"])
        assertEquals("sam@example.test", sent["email"])
        assertTrue(phone.session.awaitingBrowser && phone.session.working.value && phone.key.exists)

        phone.session.finish(mapOf("state" to sent.getValue("state"), "code" to "one-time", "purpose" to "operator"))
        assertFalse(phone.session.awaitingBrowser)
        assertEquals(listOf("POST /auth/operator-device", "POST /operator/device/challenge", "POST /operator/device/unlock"), instance.calls)
        val enrolled = instance.bodies.first()!!
        assertEquals(JsonPrimitive("public-key"), enrolled["public_key"])
        assertEquals(JsonPrimitive("android"), enrolled["platform"])
        assertEquals(JsonPrimitive("Sam's Pixel"), enrolled["device_name"])
        assertEquals(JsonPrimitive("one-time"), enrolled["code"])
        assertEquals("aqo_fixture_token_not_a_real_session", phone.vault.token)
        assertEquals("livepeer-operator-unlock\nnonce-2" to "Unlock the console", phone.key.signed.single())
        assertEquals(JsonObject(mapOf("nonce" to JsonPrimitive("nonce-2"), "signature" to JsonPrimitive("signature-1"))), JsonObject(instance.bodies.last()!!.mapValues { it.value!! }))
        assertEquals(Stage.Open, phone.session.stage.value)
        assertEquals(1, phone.session.unlocks.value)
        assertFalse(phone.session.working.value)
        assertNull(phone.session.failure.value)
    }

    @Test
    fun aSignInThatIsRefusedSaysWhyAndKeepsNoKey() = runBlocking {
        for ((answer, message) in listOf(
            mapOf("error" to "not_operator") to "This account doesn't run Livepeer.",
            mapOf("error" to "mobile_console_off") to "Livepeer doesn't offer its console on phones.",
            mapOf("error" to "method") to "That way of signing in isn't offered here.",
            mapOf("error" to "not_fresh") to "Sign-in didn't finish. Try again.",
            mapOf("code" to "one-time") to "Sign-in didn't finish. Try again.",
        )) {
            val phone = Phone(Instance())
            val state = phone.query(phone.session.start(SignInMethodName.Google, null)!!).getValue("state")
            phone.session.finish(answer + ("state" to state))
            assertEquals(message, phone.session.failure.value)
            assertEquals(Stage.SignedOut, phone.session.stage.value)
            assertFalse(phone.key.exists)
            assertNull(phone.vault.token)
            assertFalse(phone.session.working.value)
        }

        // An answer to some other sign-in, and a browser the person closed.
        val phone = Phone(Instance())
        phone.session.start(SignInMethodName.Google, null)
        phone.session.finish(mapOf("state" to "someone-else", "code" to "one-time", "purpose" to "operator"))
        assertEquals("Sign-in didn't finish. Try again.", phone.session.failure.value)
        phone.session.start(SignInMethodName.Google, null)
        phone.session.finish(null)
        assertNull(phone.session.failure.value)
        assertFalse(phone.key.exists || phone.session.working.value)
    }

    @Test
    fun aPhoneWithNoFingerprintOrFaceCantStart() {
        val phone = Phone(Instance(), key = Key(available = false))
        assertNull(phone.session.start(SignInMethodName.Email, "sam@example.test"))
        assertEquals(ConsoleSession.NEEDS_BIOMETRICS, phone.session.failure.value)
        assertFalse(phone.session.awaitingBrowser || phone.key.exists)
    }

    private fun enrolled(instance: Instance = Instance()): Phone = Phone(instance, Vault("aqo_token"), Key().apply { exists = true })

    @Test
    fun closingThePromptLeavesTheConsoleLockedAndSaysNothing() = runBlocking {
        val phone = enrolled()
        assertEquals(Stage.Locked, phone.session.stage.value)
        phone.key.failure = DeviceKeyFailure.Kind.Cancelled
        phone.session.unlock()
        assertEquals(Stage.Locked, phone.session.stage.value)
        assertNull(phone.session.failure.value)
        assertEquals("aqo_token", phone.vault.token)
    }

    @Test
    fun aKeyThatIsGoneEndsTheSessionOnThisPhone() = runBlocking {
        val phone = enrolled()
        phone.key.failure = DeviceKeyFailure.Kind.Gone
        phone.session.unlock()
        assertEquals(Stage.SignedOut, phone.session.stage.value)
        assertEquals(ConsoleSession.KEY_GONE, phone.session.failure.value)
        assertNull(phone.vault.token)
    }

    @Test
    fun anInstanceThatCantBeReachedLeavesTheConsoleLocked() = runBlocking {
        val instance = Instance().apply { unreachable = true }
        val phone = enrolled(instance)
        phone.session.unlock()
        assertEquals(Stage.Locked, phone.session.stage.value)
        assertEquals("Can't reach Livepeer. Check your connection.", phone.session.failure.value)
    }

    @Test
    fun theConsoleLocksOnARefusalOnLeavingAndAfterAMinuteAway() = runBlocking {
        val instance = Instance()
        val phone = enrolled(instance)
        phone.session.present()
        assertTrue(phone.session.presented.value)
        assertEquals(Stage.Open, phone.session.stage.value)

        // A read the instance refuses as locked.
        instance.refusal = ApiError(401, "The console is locked on this phone.", "locked")
        try {
            phone.session.read { it.operatorStatus() }
            fail("the read should be refused")
        } catch (error: ApiError) {
            assertEquals("locked", error.code)
        }
        assertEquals(Stage.Locked, phone.session.stage.value)
        assertEquals("aqo_token", phone.vault.token)

        // Under a minute in the background keeps it open; over a minute locks it.
        instance.refusal = null
        phone.session.unlock()
        assertFalse(phone.session.away)
        phone.session.left()
        // Open, but in the background: nobody is looking, so an alert that arrives now must be shown.
        assertEquals(Stage.Open, phone.session.stage.value)
        assertTrue(phone.session.away)
        phone.clock += 59_000
        phone.session.returned()
        assertFalse(phone.session.away)
        assertEquals(Stage.Open, phone.session.stage.value)
        phone.session.left()
        phone.clock += 61_000
        phone.session.returned()
        assertEquals(Stage.Locked, phone.session.stage.value)

        // Going back to the app locks it behind the person.
        phone.session.unlock()
        assertEquals(3, phone.session.unlocks.value)
        phone.session.dismiss()
        assertEquals(Stage.Locked, phone.session.stage.value)
        assertFalse(phone.session.presented.value)
    }

    @Test
    fun aSessionTheInstanceHasEndedReturnsToSignInAndLeavesNothingBehind() = runBlocking {
        for ((refusal, message, refreshes) in listOf(
            Triple(ApiError(401, "Sign in again.", "signed_out"), "The console was signed out on this phone. Sign in again.", 0),
            Triple(ApiError(403, "Not an operator session.", "operator_session"), "The console was signed out on this phone. Sign in again.", 0),
            Triple(ApiError(403, "Off.", "mobile_console_off"), "Livepeer doesn't offer its console on phones.", 1),
        )) {
            val instance = Instance()
            val phone = enrolled(instance)
            phone.session.unlock()
            instance.refusal = refusal
            runCatching { phone.session.read { it.operatorStatus() } }
            assertEquals(Stage.SignedOut, phone.session.stage.value)
            assertEquals(message, phone.session.failure.value)
            assertNull(phone.vault.token)
            assertFalse(phone.key.exists)
            assertEquals(refreshes, phone.refreshed)
        }

        // Web-only and rate limits are refusals of one request, not of the session.
        val instance = Instance()
        val phone = enrolled(instance)
        phone.session.unlock()
        instance.refusal = ApiError(403, "Use the web console for this.", "web_only")
        runCatching { phone.session.read { it.operatorStatus() } }
        assertEquals(Stage.Open, phone.session.stage.value)
    }

    @Test
    fun aChangeIsSentWithAProofBoundToItsInput() = runBlocking {
        val instance = Instance()
        val phone = enrolled(instance)
        val input = OperatorApi.operatorResolveReportInput("rep_8Jk2", "hidden")
        val decided = phone.session.confirm("operator_resolve_report", input, "Take Lumen down") { api, proof -> api.operatorResolveReport("rep_8Jk2", "hidden", proof) }
        assertEquals("rep_a86b1096-3145-4c74-8233-0962d8a6a27b", decided.id)

        assertEquals(listOf("POST /operator/device/challenge", "POST /operator/reports/rep_8Jk2"), instance.calls)
        val asked = instance.bodies.first()!!
        assertEquals(JsonPrimitive("operator_resolve_report"), asked["purpose"])
        assertEquals(JsonPrimitive("uIWZEHhlIibw00xq3FSaJx8jvGdKMDJa0sNZMB4wqmY"), asked["input_hash"])
        assertEquals("livepeer-operator-confirm\nnonce-1\noperator_resolve_report\nuIWZEHhlIibw00xq3FSaJx8jvGdKMDJa0sNZMB4wqmY" to "Take Lumen down", phone.key.signed.single())
        assertEquals(OperatorProof("nonce-1", "signature-1"), instance.proofs.last())
        // A change needs its proof, not an open console.
        assertEquals(Stage.Locked, phone.session.stage.value)
    }

    @Test
    fun aRefusedProofLeavesTheSessionInPlace() = runBlocking {
        val instance = Instance().apply { refusal = ApiError(401, "That wasn't confirmed.", "proof_required") }
        val phone = enrolled(instance)
        phone.session.unlock()
        try {
            phone.session.confirm("operator_set_user_status", OperatorApi.operatorSetUserStatusInput("usr_1", "paused"), "Suspend Dana") { api, proof -> api.operatorSetUserStatus("usr_1", "paused", proof = proof) }
            fail("the change should be refused")
        } catch (error: ApiError) {
            assertEquals("proof_required", error.code)
        }
        assertEquals(Stage.Open, phone.session.stage.value)
        assertEquals("aqo_token", phone.vault.token)
    }

    @Test
    fun signingOutEndsTheSessionAndDeletesTheKeyEvenOffline() = runBlocking {
        val instance = Instance()
        val phone = enrolled(instance)
        phone.session.signOut()
        assertEquals(listOf("DELETE /auth/operator-device"), instance.calls)
        assertEquals(Stage.SignedOut, phone.session.stage.value)
        assertNull(phone.vault.token)
        assertFalse(phone.key.exists)

        val offline = enrolled(Instance().apply { unreachable = true })
        offline.session.signOut()
        assertEquals(Stage.SignedOut, offline.session.stage.value)
        assertNull(offline.vault.token)
    }

    @Test
    fun whyAChangeDidntHappen() {
        assertEquals("In the instance's words.", ConsoleSession.changeMessage(ApiError(403, "In the instance's words."), "Livepeer"))
        assertEquals("Can't reach Livepeer. Nothing was changed.", ConsoleSession.changeMessage(IOException(), "Livepeer"))
        assertEquals(ConsoleSession.NEEDS_BIOMETRICS, ConsoleSession.changeMessage(DeviceKeyFailure(DeviceKeyFailure.Kind.Unavailable), "Livepeer"))
        assertEquals("That wasn't confirmed, so nothing was changed. Try again.", ConsoleSession.changeMessage(DeviceKeyFailure(DeviceKeyFailure.Kind.Failed), "Livepeer"))
    }

    // Status

    @Test
    fun aViewerIsOfferedNoChangesAndNobodyIsBeforeTheirRoleIsKnown() = runBlocking {
        val answer = fixture("operator_status", OperatorStatus.serializer())
        assertEquals(OperatorRole.Owner, answer.role)
        for ((role, may) in listOf(OperatorRole.Owner to true, OperatorRole.Member to true, OperatorRole.Viewer to false)) {
            val model = StatusModel { answer.copy(role = role) }
            // Nothing is offered until the instance has said which role this is.
            assertFalse(model.state.value.mayChange)
            model.load()
            assertEquals(may, model.state.value.mayChange)
        }
    }

    @Test
    fun statusKeepsTheLastAnswerWhenTheInstanceCantBeReached() = runBlocking {
        val status = fixture("operator_status", OperatorStatus.serializer())
        var answer: () -> OperatorStatus = { status }
        val model = StatusModel(now = { 42 }) { answer() }
        model.load()
        assertEquals(StatusState(status = status, checked = 42), model.state.value)

        answer = { throw IOException() }
        model.load()
        assertEquals(StatusState.Trouble.Unreachable, model.state.value.trouble)
        assertEquals(status, model.state.value.status)

        answer = { throw ApiError(500, "The engine didn't answer.") }
        model.load()
        assertEquals(StatusState.Trouble.Refused("The engine didn't answer."), model.state.value.trouble)

        // A lock replaces the whole console; the screen says nothing of its own.
        answer = { throw ApiError(401, "Locked.", "locked") }
        model.load()
        assertNull(model.state.value.trouble)
        assertFalse(model.state.value.loading)
    }

    @Test
    fun theDotIsGreenRedOrInk() {
        val waiting = fixture("operator_status", OperatorStatus.serializer()).attention
        assertEquals(Tone.Good, StatusModel.tone(emptyList()))
        assertEquals(Tone.Ink, StatusModel.tone(waiting))
        assertEquals(Tone.Bad, StatusModel.tone(waiting + waiting.single().copy(kind = OperatorAttentionKind.EngineNotReady)))
        assertEquals("Everything is running.", ConsoleFormat.headline(0))
        assertEquals("1 thing needs you.", ConsoleFormat.headline(1))
        assertEquals("3 things need you.", ConsoleFormat.headline(3))
        assertTrue(offersPlace(OperatorAttentionOpens.Jobs) && offersPlace(OperatorAttentionOpens.Reports))
        assertFalse(offersPlace(OperatorAttentionOpens.Status) || offersPlace(OperatorAttentionOpens.Unknown))
    }

    // Jobs

    @Test
    fun jobsPageBackFromTheOldestShownAndFilterOnTheInstance() = runBlocking {
        val asked = mutableListOf<Triple<String?, String?, Int>>()
        val page = List(JobsModel.PAGE_SIZE) { index -> jobs.first().copy(id = "job-$index", createdAt = "2026-11-21T18:%02d:00.000Z".format(59 - index)) }
        val older = listOf(page.last(), jobs.first().copy(id = "job-older", createdAt = "2026-11-21T17:00:00.000Z"))
        val model = JobsModel { status, before, limit ->
            asked += Triple(status, before, limit)
            when {
                status == "failed" -> failed
                before == null -> page
                else -> older
            }
        }
        assertEquals(Phase.Loading, model.state.value.phase)
        model.load()
        assertEquals(Phase.Loaded, model.state.value.phase)
        assertTrue(model.state.value.more)

        model.loadMore()
        assertEquals(Triple(null, page.last().createdAt, 30), asked.last())
        // A job on both pages is shown once, and a short page is the last.
        assertEquals(31, model.state.value.jobs.size)
        assertFalse(model.state.value.more)
        model.loadMore()
        assertEquals(2, asked.size)

        model.show(JobFilter.Failed)
        assertEquals(Triple<String?, String?, Int>("failed", null, 30), asked.last())
        assertEquals(failed, model.state.value.jobs)
        assertEquals(failed.first(), model.job(failed.first().id))
        assertEquals("Nothing has failed.", JobFilter.Failed.emptyMessage)
    }

    @Test
    fun aFailedFirstPageSaysWhyAndALaterOneKeepsTheList() = runBlocking {
        var answer: () -> List<EngineJob> = { throw IOException() }
        val model = JobsModel { _, _, _ -> answer() }
        model.load()
        assertEquals(Phase.Failed("The jobs didn't load. Check your connection."), model.state.value.phase)
        answer = { jobs }
        model.load()
        answer = { throw ApiError(500, "The engine didn't answer.") }
        model.load()
        assertEquals(Phase.Loaded, model.state.value.phase)
        assertEquals(jobs, model.state.value.jobs)
    }

    @Test
    fun aJobInWords() {
        val job = failed.first()
        assertEquals("Failed", job.stateWord)
        assertEquals(Tone.Bad, job.tone)
        assertEquals("Text to image", ConsoleFormat.appName(job.app))
        assertEquals(job.failure!!.kind, job.facts.first())
        assertEquals("…\u2060ebcb", job.facts.last())
        assertTrue(job.facts.none { ' ' in it })
        assertTrue(job.stateLine.startsWith("Failed after "))
        assertTrue(job.summary.startsWith("Text to image: failed\nJob ${job.id}\nUser usr_demo_sam\n"))
        assertTrue("Failure: ${job.failure!!.message}" in job.summary)
        assertTrue(failureFacts(job.failure!!).startsWith(job.failure!!.kind))
        assertEquals("orch-ams-2.example.test", ConsoleFormat.host(job.attempts.first().orchestratorUrl))
        assertFalse('_' in outcome(job.attempts.first()))
        assertEquals(Tone.Active, jobs.first().tone)
        assertEquals("Running", jobs.first().stateLine)
    }

    @Test
    fun factsAreWrittenTheSameEverywhere() {
        val now = ConsoleFormat.millis("2026-11-21T19:03:15.298Z")!!
        assertEquals(now, ConsoleFormat.millis("2026-11-21T19:03:15.298Z"))
        assertEquals(ConsoleFormat.millis("2026-11-21T19:03:15.000Z"), ConsoleFormat.millis("2026-11-21T19:03:15Z"))
        assertNull(ConsoleFormat.millis(null))
        assertNull(ConsoleFormat.millis("yesterday"))
        assertEquals("just now", ConsoleFormat.ago(now - 4_000, now))
        assertEquals("12 s ago", ConsoleFormat.ago(now - 12_000, now))
        assertEquals("3 min ago", ConsoleFormat.ago(now - 185_000, now))
        assertEquals("2 h ago", ConsoleFormat.ago(now - 7_300_000, now))
        assertEquals("4 d ago", ConsoleFormat.ago(now - 4 * 86_400_000L, now))
        assertEquals("just now", ConsoleFormat.ago(now + 5_000, now))
        assertEquals("640 ms", ConsoleFormat.duration(0.64))
        assertEquals("9.2 s", ConsoleFormat.duration(9.2))
        assertEquals("1 min 12 s", ConsoleFormat.duration(72.0))
        assertEquals("2 min", ConsoleFormat.duration(120.0))
        assertEquals("$6.87", ConsoleFormat.money(6.8707509))
        assertEquals("1,204", ConsoleFormat.count(1204.0))
        assertEquals("118 ms", ConsoleFormat.milliseconds(118.2))
        val utc = ZoneId.of("UTC")
        assertEquals("19:03", ConsoleFormat.clock(now, now, utc, Locale.UK))
        assertEquals("20 Nov 19:03", ConsoleFormat.clock(now - 86_400_000L, now, utc, Locale.UK))
        assertEquals("21 Nov 19:03:15", ConsoleFormat.moment(now, utc, Locale.UK))
    }

    // Reports

    @Test
    fun reportsAreAQueueLongestWaitFirstWithDecidedBelow() = runBlocking {
        val open = reports.single()
        val all = listOf(
            open.copy(id = "newer", createdAt = "2026-11-21T19:00:00.000Z"),
            open.copy(id = "kept", createdAt = "2026-11-20T10:00:00.000Z", state = CharacterReportState.Dismissed),
            open.copy(id = "older", createdAt = "2026-11-21T09:00:00.000Z"),
            open.copy(id = "taken", createdAt = "2026-11-21T08:00:00.000Z", state = CharacterReportState.Hidden),
        )
        val model = ReportsModel(read = { all }, resolve = { report, _ -> report })
        model.load()
        assertEquals(listOf("older", "newer"), model.state.value.waiting.map { it.id })
        assertEquals(listOf("taken", "kept"), model.state.value.decided.map { it.id })
        assertEquals("Kept up", CharacterReportState.Dismissed.word)
        assertEquals("Taken down", CharacterReportState.Hidden.word)
        assertEquals("Take Lumen down", ReportOutcome.Hidden.prompt(open))
        assertEquals("Keep Lumen up", ReportOutcome.Dismissed.prompt(open))
        assertTrue(open.rowKey != open.copy(state = CharacterReportState.Hidden).rowKey)
    }

    @Test
    fun aReportChangesOnlyFromTheInstancesAnswer() = runBlocking {
        val open = reports.single()
        var listed = listOf(open, open.copy(id = "other"))
        var answer: (CharacterReport, ReportOutcome) -> CharacterReport = { _, _ -> throw DeviceKeyFailure(DeviceKeyFailure.Kind.Cancelled) }
        val sent = mutableListOf<Pair<String, String>>()
        val model = ReportsModel(read = { listed }, resolve = { report, outcome -> sent += report.id to outcome.value; answer(report, outcome) })
        model.load()

        // The prompt was closed: nothing changed.
        assertEquals(ChangeOutcome.Cancelled, model.decide(open, ReportOutcome.Hidden, "Livepeer"))
        assertEquals(2, model.state.value.waiting.size)
        assertEquals(0, model.state.value.changes)

        // The instance refused: nothing changed, and it says why.
        answer = { _, _ -> throw ApiError(401, "That wasn't confirmed.", "proof_required") }
        assertEquals(ChangeOutcome.Refused("That wasn't confirmed."), model.decide(open, ReportOutcome.Hidden, "Livepeer"))
        answer = { _, _ -> throw IOException() }
        assertEquals(ChangeOutcome.Refused("Can't reach Livepeer. Nothing was changed."), model.decide(open, ReportOutcome.Hidden, "Livepeer"))
        assertEquals(2, model.state.value.waiting.size)

        // The instance took it down, which closed the character's other report too: the queue is read again.
        answer = { report, _ -> report.copy(state = CharacterReportState.Hidden) }
        listed = listed.map { it.copy(state = CharacterReportState.Hidden) }
        assertEquals(ChangeOutcome.Done, model.decide(open, ReportOutcome.Hidden, "Livepeer"))
        assertEquals(open.id to "hidden", sent.last())
        assertTrue(model.state.value.waiting.isEmpty())
        assertEquals(2, model.state.value.decided.size)
        assertEquals(1, model.state.value.changes)
        assertEquals(CharacterReportState.Hidden, model.state.value.report(open.id)?.state)
    }

    // Users

    @Test
    fun usersAreSearchedOnTheInstanceAndALateAnswerIsDropped() = runBlocking {
        val asked = mutableListOf<String?>()
        lateinit var model: UsersModel
        model = UsersModel(
            read = { query ->
                asked += query
                // While this search is on its way, the person types something else.
                if (query == "da") model.search("dan")
                users.filter { query == null || query in it.label.lowercase() }
            },
            setStatus = { _, _ -> true },
        )
        model.load()
        assertEquals(listOf<String?>(null), asked)
        assertEquals(users, model.state.value.users)

        model.search(" da ")
        model.load()
        assertEquals("da", asked.last())
        assertEquals(users, model.state.value.users)
        assertEquals("dan", model.state.value.query)
    }

    @Test
    fun aUserIsSuspendedOnlyOnceTheInstanceSaysSo() = runBlocking {
        val active = users.first { it.allocation?.status == KnownActorAllocationStatus.Active }
        var listed = users
        var answer: () -> Boolean = { throw DeviceKeyFailure(DeviceKeyFailure.Kind.Cancelled) }
        val sent = mutableListOf<Pair<String, String>>()
        val model = UsersModel(read = { listed }, setStatus = { user, status -> sent += user.actorId to status.value; answer() })
        model.load()

        assertEquals(ChangeOutcome.Cancelled, model.set(active, UserStatus.Paused, "Livepeer"))
        answer = { false }
        assertEquals(ChangeOutcome.Refused("Livepeer couldn't change that account. Nothing was changed."), model.set(active, UserStatus.Paused, "Livepeer"))
        assertTrue(model.state.value.user(active.actorId)!!.canSuspend)
        assertEquals(0, model.state.value.changes)

        answer = { true }
        listed = users.map { if (it.actorId == active.actorId) it.copy(allocation = it.allocation!!.copy(status = KnownActorAllocationStatus.Paused)) else it }
        assertEquals(ChangeOutcome.Done, model.set(active, UserStatus.Paused, "Livepeer"))
        assertEquals(active.actorId to "paused", sent.last())
        val suspended = model.state.value.user(active.actorId)!!
        assertTrue(suspended.canResume && !suspended.canSuspend)
        assertEquals("Suspended", suspended.standing)
        assertEquals(Tone.Bad, suspended.tone)
        assertTrue(suspended.rowKey != active.rowKey)
        assertEquals(1, model.state.value.changes)
    }

    @Test
    fun aUserInWords() {
        val adam = users.first()
        assertEquals("Adam Soffer", adam.displayName)
        assertEquals("Sam", adam.copy(name = "Sam").displayName)
        assertEquals(adam.actorId, adam.copy(label = "").displayName)
        assertEquals("Active", adam.standing)
        assertEquals("No allocation", adam.copy(allocation = null).standing)
        assertEquals("Out of credit", adam.copy(allocation = adam.allocation!!.copy(status = KnownActorAllocationStatus.Exhausted)).standing)
        assertFalse(adam.copy(allocation = null).canSuspend || adam.copy(allocation = null).canResume)
        assertEquals("Suspend Adam Soffer", UserStatus.Paused.prompt(adam))
        assertEquals("Resume Adam Soffer", UserStatus.Active.prompt(adam))
    }

    // The numbers (stage 2)

    @Test
    fun theStageTwoReadsDecode() {
        val costs = fixture("operator_costs", CostSummary.serializer())
        assertTrue(costs.byClass.delivered.usd > 0)
        assertTrue(costs.byApp.getValue("text-to-video").delivered != null)
        assertEquals("grt_launch", fixture("operator_list_grants", ListSerializer(Grant.serializer())).first().id)
        assertTrue(fixture("operator_list_plans", ListSerializer(Plan.serializer())).all { it.name.isNotEmpty() })
        assertTrue(fixture("operator_list_compute", ListSerializer(ComputeOperator.serializer())).none { it.status == ComputeOperatorStatus.Unknown })
        assertEquals("Text to video", fixture("operator_list_capabilities", ListSerializer(OfferedCapability.serializer())).first().name)
        assertEquals(14, fixture("operator_overview", OverviewStats.serializer()).series.size)
    }

    @Test
    fun networkCostIsListedByCapabilityDearestFirst() {
        val costs = fixture("operator_costs", CostSummary.serializer())
        val lines = costs.lines
        assertEquals("text-to-video", lines.first().app)
        val totals = lines.map { it.delivered + it.lost }
        assertEquals(totals.sortedDescending(), totals)
        assertTrue(totals.all { it > 0 })
        // Failed after payment and unknown outcomes are both money that bought nothing.
        assertEquals(0.4, lines.first().lost, 0.000001)
        assertTrue(lines.first().showsLost)
        assertFalse(lines.first().copy(lost = 0.00002).showsLost)
        assertEquals(15.398559 + 0.922029, costs.paid, 0.000001)
        assertEquals("$0.0003", ConsoleFormat.fee(0.000319))
        assertEquals("$7.20", ConsoleFormat.fee(7.2))
        assertEquals("$0.00", ConsoleFormat.fee(0.0))
    }

    @Test
    fun revenueAddsUpOverTheDaysShown() {
        val stats = fixture("operator_overview", OverviewStats.serializer())
        assertEquals(stats.periodRevenue - stats.periodCost, stats.periodMargin, 0.000001)
        assertTrue(stats.peak >= stats.series.last().revenueUsd)
        assertEquals("$1.50\u00A0· 25%", marginLine(1.5, 6.0))
        assertEquals("$0.00", marginLine(0.0, 0.0))
        assertEquals("8 Nov", ConsoleFormat.day("2026-11-08", Locale.UK))
        assertEquals("soon", ConsoleFormat.day("soon"))
        assertEquals("Failed\u00A0· 1\u00A0attempt", factLine(listOf("Failed", "1 attempt")))
    }

    @Test
    fun grantsPlansComputeAndCapabilitiesInWords() {
        val grant = fixture("operator_list_grants", ListSerializer(Grant.serializer())).first()
        assertEquals("$500.00", ConsoleFormat.money(grant.funded))
        assertEquals(290.0, grant.unallocated, 0.0)
        assertEquals("12 XYZ", ConsoleFormat.money(grant.funded.copy(amount = "12", currency = "XYZ")))

        val plan = fixture("operator_list_plans", ListSerializer(Plan.serializer())).first()
        assertEquals("$18.00 a month", plan.priceLine)
        assertEquals("2,000 credits a month", plan.allowanceLine)
        assertEquals("default markup", ConsoleFormat.markup(plan.markup))
        assertEquals("1.25×", ConsoleFormat.markup(1.25))

        val compute = fixture("operator_list_compute", ListSerializer(ComputeOperator.serializer())).first()
        assertEquals("orch-ams-2.example.test", compute.host)
        assertEquals(listOf("67 jobs", "5 failed", "1.7 s median"), compute.facts)
        assertFalse(compute.blocked)
        assertEquals(listOf("1 job", "5 failed"), compute.copy(jobs = 1.0, medianResponseMs = null).facts)

        val capability = fixture("operator_list_capabilities", ListSerializer(OfferedCapability.serializer())).first()
        assertEquals("Offered" to Tone.Good, capability.standing)
        assertEquals(listOf("5 of 6 ready", "default markup"), capability.facts)
        assertEquals("No one ready" to Tone.Bad, capability.copy(readyCount = 0.0).standing)
        assertEquals("Not offered" to Tone.Quiet, capability.copy(enabled = false).standing)
        assertEquals("not seen lately", capability.copy(stale = true).facts.last())
    }

    @Test
    fun aReadKeepsWhatItHasAndSaysWhyTheFirstOneFailed() = runBlocking {
        var answer: () -> Int = { throw IOException() }
        val read = ConsoleRead("It didn't load.") { answer() }
        assertEquals(Phase.Loading, read.state.value.phase)
        read.load()
        assertEquals(Phase.Failed("It didn't load."), read.state.value.phase)

        answer = { throw ApiError(500, "The engine didn't answer.") }
        read.load()
        assertEquals(Phase.Failed("The engine didn't answer."), read.state.value.phase)

        answer = { 7 }
        read.load()
        assertEquals(ReadState(7, Phase.Loaded), read.state.value)

        // A later failure keeps what is shown; a lock says nothing here at all.
        answer = { throw IOException() }
        read.load()
        assertEquals(ReadState(7, Phase.Loaded), read.state.value)
        answer = { throw ApiError(401, "Locked.", "locked") }
        read.load()
        assertEquals(ReadState(7, Phase.Loaded), read.state.value)
    }
}

package org.livepeer.app

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.livepeer.app.alerts.Alert
import org.livepeer.app.api.ApiError
import org.livepeer.app.api.ApiTransport
import org.livepeer.app.api.DeviceKeyFailure
import org.livepeer.app.api.OperatorProofs
import org.livepeer.app.api.TokenStore
import org.livepeer.app.console.AlertsMemory
import org.livepeer.app.console.AlertsModel
import org.livepeer.app.console.AlertsStanding
import org.livepeer.app.console.ChangeOutcome
import org.livepeer.app.console.Phase
import org.livepeer.app.console.PushDevice
import org.livepeer.app.console.PushSupport
import org.livepeer.app.console.PushUnavailable
import org.livepeer.app.console.alertsSentence
import org.livepeer.app.generated.Done
import org.livepeer.app.generated.OperatorAlertChoice
import org.livepeer.app.generated.OperatorAlertKind
import org.livepeer.app.generated.OperatorAlerts
import org.livepeer.app.generated.OperatorAlertsState
import org.livepeer.app.generated.OperatorApi
import java.io.File
import java.io.IOException

/** Alerts on an operator's phone: what the page says, and that nothing changes without a match (plan, section 18.9). */
class AlertsTest {
    private fun text(name: String): String = File("../../../docs/mobile/fixtures/$name.json").readText()

    private class Store(override var token: String? = null) : TokenStore {
        override fun set(value: String?) {
            token = value
        }
    }

    /** The phone's side, standing in for Firebase and the system's settings. */
    private class Device(override var support: PushSupport = PushSupport.Ready, override var allowed: Boolean = true, var pushToken: String? = "push-token-1") : PushDevice {
        var asked = 0
        var prepared = 0
        var forgotten = 0

        override suspend fun token(): String {
            asked += 1
            return pushToken ?: throw PushUnavailable()
        }

        override fun prepare() {
            prepared += 1
        }

        override fun forget() {
            forgotten += 1
        }
    }

    private val all = listOf(OperatorAlertKind.EngineNotReady, OperatorAlertKind.JobsFailing, OperatorAlertKind.ReportsWaiting)
    private val labels = mapOf(OperatorAlertKind.EngineNotReady to "The engine stops being ready", OperatorAlertKind.JobsFailing to "Jobs are failing", OperatorAlertKind.ReportsWaiting to "A report is waiting")

    private fun alerts(state: OperatorAlertsState, on: Set<OperatorAlertKind> = emptySet(), offered: Boolean = true) = OperatorAlerts(
        offered = offered,
        state = state,
        kinds = all.map { OperatorAlertChoice(it, labels.getValue(it), it in on) },
        until = if (state == OperatorAlertsState.Off) null else "2026-12-21T09:00:00Z",
        lastAlertAt = null,
    )

    /** An instance that holds this phone's alerts and takes changes, and a phone to go with it. */
    private inner class World(var held: OperatorAlerts = alerts(OperatorAlertsState.Off), val device: Device = Device(), val store: Store = Store()) {
        val sets = mutableListOf<Triple<List<String>, String?, String>>()
        var refusal: Exception? = null
        var testHanded = true
        val memory = AlertsMemory(store)
        val model = AlertsModel(
            device = device,
            memory = memory,
            read = { refusal?.let { throw it } ?: held },
            set = { kinds, pushToken, reason ->
                refusal?.let { throw it }
                sets += Triple(kinds, pushToken, reason)
                held = if (kinds.isEmpty()) alerts(OperatorAlertsState.Off) else alerts(OperatorAlertsState.On, all.filter { it.value in kinds }.toSet())
                held
            },
            test = { refusal?.let { throw it } ?: testHanded },
        )
        val state get() = model.state.value
    }

    @Test
    fun theInstancesAnswersDecode() {
        val read = ApiTransport.json.decodeFromString(OperatorAlerts.serializer(), text("operator_get_alerts"))
        assertTrue(read.offered)
        assertEquals(OperatorAlertsState.On, read.state)
        assertEquals(listOf("The engine stops being ready", "Jobs are failing", "A report is waiting"), read.kinds.map { it.label })
        assertEquals(listOf(true, false, true), read.kinds.map { it.on })
        assertEquals(OperatorAlertsState.On, ApiTransport.json.decodeFromString(OperatorAlerts.serializer(), text("operator_set_alerts")).state)
        assertTrue(ApiTransport.json.decodeFromString(Done.serializer(), text("operator_test_alert")).ok)
        // No answer about alerts ever carries the push token.
        for (name in listOf("operator_get_alerts", "operator_set_alerts")) assertFalse(text(name).contains("token"))
    }

    @Test
    fun whatIsSignedForAlertsIsWhatTheInstanceHashes() {
        val vectors = ApiTransport.json.parseToJsonElement(text("operator_proof_vectors")).jsonObject.getValue("inputs").jsonArray
        val on = vectors.first { it.jsonObject.getValue("canonical").jsonPrimitive.content.contains("push_token") }.jsonObject
        val off = vectors.first { it.jsonObject.getValue("canonical").jsonPrimitive.content == """{"kinds":[]}""" }.jsonObject
        assertEquals(on.getValue("hash").jsonPrimitive.content, OperatorProofs.inputHash(OperatorApi.operatorSetAlertsInput(listOf("engine_not_ready", "reports_waiting"), "5a".repeat(32), "development")))
        assertEquals(off.getValue("hash").jsonPrimitive.content, OperatorProofs.inputHash(OperatorApi.operatorSetAlertsInput(emptyList())))
        // Android has one messaging service, so it names no environment and none is hashed.
        assertEquals("""{"kinds":["jobs_failing"],"push_token":"abc"}""", OperatorProofs.canonical(OperatorApi.operatorSetAlertsInput(listOf("jobs_failing"), "abc")))
        assertEquals("{}", OperatorProofs.canonical(OperatorApi.operatorTestAlertInput()))
    }

    @Test
    fun offUntilTurnedOnWithEveryKindOfferedAndNothingAskedOfTheSystem() = runBlocking {
        val world = World()
        assertEquals(AlertsStanding.Unknown, world.state.standing)
        assertEquals(Phase.Loading, world.state.phase)
        world.model.load()
        assertEquals(AlertsStanding.Off, world.state.standing)
        assertEquals(all.toSet(), world.state.draft)
        assertEquals("Turn on alerts", world.state.action)
        assertEquals("Off", world.state.summary)
        // Reading the page makes no push token: one is asked for only when alerts are turned on.
        assertEquals(0, world.device.asked)
        assertEquals(0, world.device.prepared)
        assertNull(world.store.token)
    }

    @Test
    fun turningOnAsksToShowNotificationsThenForAPushTokenThenTheInstance() = runBlocking {
        val world = World()
        world.model.load()
        world.model.toggle(OperatorAlertKind.JobsFailing)
        assertEquals("Turn on alerts", world.state.action)
        val steps = mutableListOf<String>()
        val outcome = world.model.apply("Livepeer") {
            steps += "permission, with ${world.device.asked} tokens asked and ${world.sets.size} changes sent"
            true
        }
        assertEquals(ChangeOutcome.Done, outcome)
        assertEquals(listOf("permission, with 0 tokens asked and 0 changes sent"), steps)
        // The kinds go in the instance's own order, with this phone's push token, under the words in the prompt.
        assertEquals(listOf(Triple(listOf("engine_not_ready", "reports_waiting"), "push-token-1", "Turn on alerts")), world.sets)
        assertEquals(1, world.device.prepared)
        assertEquals(AlertsStanding.On, world.state.standing)
        assertEquals("On · 2 of 3", world.state.summary)
        assertNull(world.state.action)
        assertEquals(1, world.state.changes)
        assertEquals(AlertsMemory.Remembered(listOf("engine_not_ready", "reports_waiting"), "push-token-1"), world.memory.value)
    }

    @Test
    fun nothingIsSentWhenNotificationsAreRefusedOrThereIsNoPushToken() = runBlocking {
        val refused = World()
        refused.model.load()
        assertEquals(ChangeOutcome.Refused("Notifications are off for Livepeer in Settings, so alerts can't show."), refused.model.apply("Livepeer") { false })
        assertEquals(0, refused.device.asked)
        assertTrue(refused.sets.isEmpty())
        assertEquals(AlertsStanding.Off, refused.state.standing)

        val unreachable = World(device = Device(pushToken = null))
        unreachable.model.load()
        assertEquals(ChangeOutcome.Refused("This phone couldn't be given an address for alerts. Check your connection and try again."), unreachable.model.apply("Livepeer") { true })
        assertTrue(unreachable.sets.isEmpty())
        assertNull(unreachable.store.token)
    }

    @Test
    fun aClosedPromptOrARefusalChangesNothing() = runBlocking {
        val world = World()
        world.model.load()
        world.refusal = DeviceKeyFailure(DeviceKeyFailure.Kind.Cancelled)
        assertEquals(ChangeOutcome.Cancelled, world.model.apply("Livepeer") { true })
        world.refusal = ApiError(409, "This service hasn't set up alerts for this kind of phone.", "alerts_not_offered")
        assertEquals(ChangeOutcome.Refused("This service hasn't set up alerts for this kind of phone."), world.model.apply("Livepeer") { true })
        world.refusal = IOException("offline")
        assertEquals(ChangeOutcome.Refused("Can't reach Livepeer. Nothing was changed."), world.model.apply("Livepeer") { true })
        assertEquals(AlertsStanding.Off, world.state.standing)
        assertEquals(0, world.state.changes)
        assertNull(world.store.token)
    }

    @Test
    fun theSwitchesAreADraftUntilSavedAndSavingNoneTurnsAlertsOff() = runBlocking {
        val world = World(held = alerts(OperatorAlertsState.On, setOf(OperatorAlertKind.EngineNotReady)), store = Store())
        world.memory.value = AlertsMemory.Remembered(listOf("engine_not_ready"), "push-token-1")
        world.model.load()
        assertEquals(setOf(OperatorAlertKind.EngineNotReady), world.state.draft)
        assertNull(world.state.action)

        world.model.toggle(OperatorAlertKind.ReportsWaiting)
        assertEquals("Save changes", world.state.action)
        // A read while the switches are being moved doesn't put them back.
        world.model.load()
        assertEquals(setOf(OperatorAlertKind.EngineNotReady, OperatorAlertKind.ReportsWaiting), world.state.draft)
        assertTrue(world.sets.isEmpty())
        assertEquals(ChangeOutcome.Done, world.model.apply("Livepeer") { true })
        assertEquals("Save alert choices", world.sets.single().third)

        world.model.toggle(OperatorAlertKind.EngineNotReady)
        world.model.toggle(OperatorAlertKind.ReportsWaiting)
        assertEquals("Turn off alerts", world.state.action)
        assertEquals(ChangeOutcome.Done, world.model.apply("Livepeer") { error("turning off asks the system nothing") })
        assertEquals(Triple(emptyList<String>(), null, "Turn off alerts"), world.sets.last())
        assertEquals(AlertsStanding.Off, world.state.standing)
        // The push token is given up, and the last choices are kept to offer again.
        assertEquals(1, world.device.forgotten)
        assertEquals(AlertsMemory.Remembered(listOf("engine_not_ready", "reports_waiting"), null), world.memory.value)
        assertEquals(setOf(OperatorAlertKind.EngineNotReady, OperatorAlertKind.ReportsWaiting), world.state.draft)
    }

    @Test
    fun alertsThatNoLongerReachThePhoneSaySoAndAreMendedByTurningThemBackOn() = runBlocking {
        // The system issued a new push token since the instance was given one.
        val moved = World(held = alerts(OperatorAlertsState.On, all.toSet()), device = Device(pushToken = "push-token-2"))
        moved.memory.value = AlertsMemory.Remembered(all.map { it.value }, "push-token-1")
        moved.model.load()
        assertEquals(AlertsStanding.Stopped, moved.state.standing)
        assertEquals("Stopped", moved.state.summary)
        assertEquals("Turn them back on", moved.state.action)
        assertEquals(ChangeOutcome.Done, moved.model.apply("Livepeer") { true })
        assertEquals("push-token-2", moved.sets.single().second)
        assertEquals(AlertsStanding.On, moved.state.standing)

        // Google told the instance the push token is dead.
        val dead = World(held = alerts(OperatorAlertsState.NotReaching, setOf(OperatorAlertKind.ReportsWaiting)))
        dead.model.load()
        assertEquals(AlertsStanding.Stopped, dead.state.standing)
        assertEquals(setOf(OperatorAlertKind.ReportsWaiting), dead.state.draft)

        // The same push token as before is not a change.
        val same = World(held = alerts(OperatorAlertsState.On, all.toSet()))
        same.memory.value = AlertsMemory.Remembered(all.map { it.value }, "push-token-1")
        same.model.load()
        assertEquals(AlertsStanding.On, same.state.standing)
    }

    @Test
    fun thePageSaysWhyThereIsNothingToChoose() = runBlocking {
        val notOffered = World(held = alerts(OperatorAlertsState.Off, offered = false))
        notOffered.model.load()
        assertEquals(AlertsStanding.NotOffered, notOffered.state.standing)
        assertEquals("Not available", notOffered.state.summary)
        assertNull(notOffered.state.action)

        // The instance offers alerts but hasn't said which Firebase project to ask: the phone can't get a push token.
        val notSetUp = World(device = Device(support = PushSupport.NotSetUp))
        notSetUp.model.load()
        assertEquals(AlertsStanding.NotOffered, notSetUp.state.standing)

        val noPlay = World(device = Device(support = PushSupport.NoPlayServices))
        noPlay.model.load()
        assertEquals(AlertsStanding.Unsupported, noPlay.state.standing)
        assertNull(noPlay.state.action)
    }

    @Test
    fun notificationsSwitchedOffInSettingsAreSaidAndReadAgainOnReturn() = runBlocking {
        val world = World(held = alerts(OperatorAlertsState.On, all.toSet()), device = Device(allowed = false))
        world.memory.value = AlertsMemory.Remembered(all.map { it.value }, "push-token-1")
        world.model.load()
        assertEquals(AlertsStanding.Blocked, world.state.standing)
        assertEquals("Stopped", world.state.summary)
        world.device.allowed = true
        world.model.recheck()
        assertEquals(AlertsStanding.On, world.state.standing)
    }

    @Test
    fun aTestAlertSaysHowItWent() = runBlocking {
        val world = World(held = alerts(OperatorAlertsState.On, all.toSet()))
        world.model.load()
        assertNull(world.state.tested)
        assertEquals(ChangeOutcome.Done, world.model.sendTest("Livepeer"))
        assertEquals(true, world.state.tested)
        world.testHanded = false
        world.model.sendTest("Livepeer")
        assertEquals(false, world.state.tested)
        world.refusal = ApiError(429, "Three test alerts an hour. Try again later.", "rate_limited")
        assertEquals(ChangeOutcome.Refused("Three test alerts an hour. Try again later."), world.model.sendTest("Livepeer"))
        // Moving a switch clears what the last test said.
        world.refusal = null
        world.model.toggle(OperatorAlertKind.JobsFailing)
        assertNull(world.state.tested)
    }

    @Test
    fun signingOutOfTheConsoleKeepsNothingAndGivesThePushTokenUp() = runBlocking {
        val world = World()
        world.model.load()
        world.model.apply("Livepeer") { true }
        assertTrue(world.store.token != null)
        world.model.forgotten()
        assertNull(world.store.token)
        assertEquals(1, world.device.forgotten)
        assertEquals(AlertsStanding.Unknown, world.state.standing)
    }

    @Test
    fun afterSigningInAgainTheLastChoicesAreOfferedAndAFailedReadIsSaidOnce() = runBlocking {
        val world = World()
        world.memory.value = AlertsMemory.Remembered(listOf("reports_waiting"), null)
        world.model.load()
        assertEquals(setOf(OperatorAlertKind.ReportsWaiting), world.state.draft)

        val failing = World()
        failing.refusal = IOException("offline")
        failing.model.load()
        assertEquals(Phase.Failed("Alerts didn't load. Check your connection."), failing.state.phase)
        // A lock or a sign-out replaces the whole console; the page has nothing to say about it.
        val locked = World()
        locked.refusal = ApiError(401, "The console is locked on this phone.", "locked")
        locked.model.load()
        assertEquals(Phase.Loading, locked.state.phase)
        // A read that fails later keeps what was shown.
        val later = World(held = alerts(OperatorAlertsState.On, all.toSet()))
        later.model.load()
        later.refusal = IOException("offline")
        later.model.load()
        assertEquals(AlertsStanding.On, later.state.standing)
    }

    @Test
    fun aKindThisBuildDoesntKnowIsLeftOffThePageAndNeverSent() = runBlocking {
        val newer = alerts(OperatorAlertsState.Off).let { it.copy(kinds = it.kinds + OperatorAlertChoice(OperatorAlertKind.Unknown, "Something a newer instance alerts on", false)) }
        val world = World(held = newer)
        world.model.load()
        assertEquals(3, world.state.choices.size)
        world.model.apply("Livepeer") { true }
        assertEquals(listOf("engine_not_ready", "jobs_failing", "reports_waiting"), world.sets.single().first)
    }

    @Test
    fun theTrayNamesTheKindsChosen() {
        val choices = all.map { OperatorAlertChoice(it, labels.getValue(it), false) }
        assertEquals("the engine stops being ready, jobs are failing or a report is waiting", alertsSentence(choices, all.toSet()))
        assertEquals("the engine stops being ready or a report is waiting", alertsSentence(choices, setOf(OperatorAlertKind.ReportsWaiting, OperatorAlertKind.EngineNotReady)))
        assertEquals("jobs are failing", alertsSentence(choices, setOf(OperatorAlertKind.JobsFailing)))
        assertEquals("", alertsSentence(choices, emptySet()))
    }

    @Test
    fun aTappedAlertLeadsToOneOfThreePlacesAndNowhereElse() {
        assertEquals(Alert.Place.Jobs, Alert.place("jobs"))
        assertEquals(Alert.Place.Reports, Alert.place("reports"))
        assertEquals(Alert.Place.Status, Alert.place("status"))
        // Anything else, including an address, is Status.
        for (other in listOf(null, "", "users", "https://example.test/sign-in", "more/alerts")) assertEquals(Alert.Place.Status, Alert.place(other))
    }

    @Test
    fun anAlertIsReadFromTheWordsTheInstanceSends() {
        val sent = mapOf("title" to "Livepeer", "body" to "2 reports are waiting", "kind" to "reports_waiting", "opens" to "reports", "channel" to "console_reports", "tag" to "console-reports_waiting")
        assertEquals(Alert("Livepeer", "2 reports are waiting", "reports_waiting", Alert.Place.Reports, "console_reports", "console-reports_waiting"), Alert.read(sent))
        // A message with no words or no kind isn't an alert, and nothing is shown for it.
        assertNull(Alert.read(sent - "body"))
        assertNull(Alert.read(sent + ("body" to " ")))
        assertNull(Alert.read(sent - "kind"))
        assertNull(Alert.read(emptyMap()))
    }

    @Test
    fun whatAnAlertLeavesOutOrGetsWrongFallsBackToWhatThisBuildKnows() {
        val bare = Alert.read(mapOf("body" to "The engine isn't ready", "kind" to "engine_not_ready"))
        assertEquals(Alert("", "The engine isn't ready", "engine_not_ready", Alert.Place.Status, "console_service", "console-engine_not_ready"), bare)
        // A channel or a place this build has never heard of is Service and Status, never something made up on the phone.
        val odd = Alert.read(mapOf("body" to "Something new", "kind" to "later_kind", "opens" to "https://example.test", "channel" to "marketing", "tag" to ""))
        assertEquals(Alert("", "Something new", "later_kind", Alert.Place.Status, "console_service", "console-later_kind"), odd)
    }
}

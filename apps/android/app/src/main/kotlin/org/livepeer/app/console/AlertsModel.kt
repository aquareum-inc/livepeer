package org.livepeer.app.console

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.Serializable
import org.livepeer.app.api.ApiError
import org.livepeer.app.api.ApiTransport
import org.livepeer.app.api.TokenStore
import org.livepeer.app.generated.OperatorAlertChoice
import org.livepeer.app.generated.OperatorAlertKind
import org.livepeer.app.generated.OperatorAlerts
import org.livepeer.app.generated.OperatorAlertsState

/** Whether this phone can be given an address for alerts at all. */
enum class PushSupport {
    Ready,

    /** The instance hasn't said how to reach Google's messaging service, so there is nothing to ask for an address. */
    NotSetUp,

    /** The phone has no Google Play services, which deliver every alert on Android. */
    NoPlayServices,
}

/** The system couldn't give this phone an address for alerts just now. */
class PushUnavailable : Exception("no push token")

/**
 * The phone's side of alerts: what the system allows and the push token it gives. Nothing here talks to the
 * instance, and nothing here is asked for until the operator turns alerts on.
 */
interface PushDevice {
    val support: PushSupport

    /** Whether notifications from this app may show at all. */
    val allowed: Boolean

    /** The address the system gives this phone for alerts. Throws [PushUnavailable] when it can't. */
    suspend fun token(): String

    /** Makes the places alerts arrive in, where the system has such things. */
    fun prepare()

    /** Gives the push token up, so nothing more can be sent to this phone even if the instance couldn't be told. */
    fun forget()
}

/**
 * What the phone remembers about its alerts, beside the console's own token and under the same protection:
 * the kinds last chosen, to offer again after the monthly sign-in, and the push token it last registered, to
 * notice when the system has issued another. Gone when the console signs out.
 */
class AlertsMemory(private val store: TokenStore) {
    @Serializable
    data class Remembered(val kinds: List<String> = emptyList(), val registered: String? = null)

    var value: Remembered
        get() = store.token?.let { runCatching { ApiTransport.json.decodeFromString(Remembered.serializer(), it) }.getOrNull() } ?: Remembered()
        set(next) = store.set(ApiTransport.json.encodeToString(Remembered.serializer(), next))

    fun clear() = store.set(null)
}

/** Where alerts stand on this phone, as the page says it. */
enum class AlertsStanding {
    /** Not read yet. */
    Unknown,

    /** The instance can't send to this kind of phone. */
    NotOffered,

    /** This phone can't receive them. */
    Unsupported,
    Off,
    On,

    /** On, but notifications are switched off for the app in the phone's settings. */
    Blocked,

    /** They were on and no longer reach this phone: the push token changed, or Google says it is dead. */
    Stopped,
}

data class AlertsState(
    val alerts: OperatorAlerts? = null,
    val phase: Phase = Phase.Loading,
    /** The kinds chosen on the page. Nothing changes until they are applied with a fingerprint or face. */
    val draft: Set<OperatorAlertKind> = emptySet(),
    val support: PushSupport = PushSupport.Ready,
    val allowed: Boolean = true,
    /** The system has issued this phone a different push token from the one the instance holds. */
    val moved: Boolean = false,
    /** How the last test alert went: true when the instance handed it over. */
    val tested: Boolean? = null,
    /** Counts confirmed changes, for the one haptic each gets. */
    val changes: Int = 0,
) {
    /** The choices this build knows how to name. */
    val choices: List<OperatorAlertChoice> get() = alerts?.kinds.orEmpty().filter { it.kind != OperatorAlertKind.Unknown }

    private val on: Set<OperatorAlertKind> get() = choices.filter { it.on }.map { it.kind }.toSet()

    val standing: AlertsStanding
        get() = when {
            alerts == null -> AlertsStanding.Unknown
            !alerts.offered || support == PushSupport.NotSetUp -> AlertsStanding.NotOffered
            support == PushSupport.NoPlayServices -> AlertsStanding.Unsupported
            alerts.state == OperatorAlertsState.Off || alerts.state == OperatorAlertsState.Unknown -> AlertsStanding.Off
            alerts.state == OperatorAlertsState.NotReaching || moved -> AlertsStanding.Stopped
            !allowed -> AlertsStanding.Blocked
            else -> AlertsStanding.On
        }

    /** Whether the switches differ from what the instance holds while alerts are on. */
    val edited: Boolean get() = alerts?.state == OperatorAlertsState.On && draft != on

    /** The page's one action, or none when there is nothing to apply. */
    val action: String?
        get() = when (standing) {
            AlertsStanding.Off -> "Turn on alerts".takeIf { draft.isNotEmpty() }
            AlertsStanding.Stopped -> "Turn them back on".takeIf { draft.isNotEmpty() }
            AlertsStanding.On, AlertsStanding.Blocked -> if (!edited) null else if (draft.isEmpty()) "Turn off alerts" else "Save changes"
            else -> null
        }

    /** A few words for the row on More. */
    val summary: String
        get() = when (standing) {
            AlertsStanding.Unknown -> ""
            AlertsStanding.NotOffered, AlertsStanding.Unsupported -> "Not available"
            AlertsStanding.Off -> "Off"
            AlertsStanding.On -> "On · ${on.size} of ${choices.size}"
            AlertsStanding.Blocked, AlertsStanding.Stopped -> "Stopped"
        }
}

/**
 * Alerts on this phone: read from the instance, chosen on the page, and changed only with a fingerprint or
 * face. Turning them on asks the system for a push token and hands it to the instance under a proof bound to
 * it, so nothing but this phone can point alerts elsewhere or switch them off.
 */
class AlertsModel(
    private val device: PushDevice,
    private val memory: AlertsMemory,
    private val read: suspend () -> OperatorAlerts,
    /** Sets the kinds and the push token, confirmed with a match under [reason]. No kinds turns alerts off. */
    private val set: suspend (kinds: List<String>, pushToken: String?, reason: String) -> OperatorAlerts,
    /** Sends this phone a test alert, confirmed with a match. True when the instance handed it over. */
    private val test: suspend () -> Boolean,
) {
    private val _state = MutableStateFlow(AlertsState())
    val state: StateFlow<AlertsState> = _state

    suspend fun load() {
        try {
            val fresh = read()
            val remembered = memory.value
            // Only a phone whose alerts are on has a push token to compare, and asking for one otherwise would make one.
            val current = if (fresh.state == OperatorAlertsState.On && remembered.registered != null && device.support == PushSupport.Ready) runCatching { device.token() }.getOrNull() else null
            _state.update { before ->
                val next = before.copy(alerts = fresh, phase = Phase.Loaded, support = device.support, allowed = device.allowed, moved = current != null && current != remembered.registered)
                // The switches follow the instance until someone has moved one.
                if (before.alerts != null && before.edited) next else next.copy(draft = chosen(fresh, remembered))
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            if (error.endsTheConsole) return
            _state.update { if (it.alerts != null) it else it.copy(phase = Phase.Failed((error as? ApiError)?.message ?: "Alerts didn't load. Check your connection.")) }
        }
    }

    /** What the phone's own settings say now: read again when the app comes back from them. */
    fun recheck() = _state.update { it.copy(support = device.support, allowed = device.allowed) }

    fun toggle(kind: OperatorAlertKind) = _state.update { it.copy(draft = if (kind in it.draft) it.draft - kind else it.draft + kind, tested = null) }

    /**
     * Applies the switches: turns alerts on, changes which are on, or with none chosen turns them off. [permit]
     * asks the system whether notifications may show, the first time; nothing is sent to the instance without it.
     */
    suspend fun apply(instance: String, permit: suspend () -> Boolean): ChangeOutcome {
        val kinds = _state.value.choices.map { it.kind }.filter { it in _state.value.draft }
        if (kinds.isEmpty()) return turnOff(instance)
        return change(instance) {
            if (!permit()) return@change ChangeOutcome.Refused("Notifications are off for $instance in Settings, so alerts can't show.")
            device.prepare()
            val pushToken = try {
                device.token()
            } catch (error: PushUnavailable) {
                return@change ChangeOutcome.Refused("This phone couldn't be given an address for alerts. Check your connection and try again.")
            }
            val answer = set(kinds.map { it.value }, pushToken, if (_state.value.standing == AlertsStanding.On) "Save alert choices" else "Turn on alerts")
            memory.value = AlertsMemory.Remembered(kinds.map { it.value }, pushToken)
            settle(answer)
            ChangeOutcome.Done
        }
    }

    /** Turns alerts off on the instance, then gives the push token up. The choices are kept to offer again. */
    suspend fun turnOff(instance: String): ChangeOutcome = change(instance) {
        val answer = set(emptyList(), null, "Turn off alerts")
        memory.value = memory.value.copy(registered = null)
        device.forget()
        settle(answer)
        ChangeOutcome.Done
    }

    /** Sends this phone a test alert. The page says how it went; nothing else changes. */
    suspend fun sendTest(instance: String): ChangeOutcome = change(instance) {
        val handed = test()
        _state.update { it.copy(tested = handed) }
        load()
        ChangeOutcome.Done
    }

    /** The console signed out on this phone: nothing about its alerts is kept, and the push token is given up. */
    fun forgotten() {
        memory.clear()
        device.forget()
        _state.value = AlertsState()
    }

    private fun settle(answer: OperatorAlerts) = _state.update {
        it.copy(alerts = answer, phase = Phase.Loaded, support = device.support, allowed = device.allowed, moved = false, tested = null, draft = chosen(answer, memory.value), changes = it.changes + 1)
    }

    private companion object {
        /** What the switches show: what is on; or, while alerts are off, what was chosen last time, or everything. */
        fun chosen(alerts: OperatorAlerts, remembered: AlertsMemory.Remembered): Set<OperatorAlertKind> {
            val known = alerts.kinds.map { it.kind }.filter { it != OperatorAlertKind.Unknown }
            val on = alerts.kinds.filter { it.on }.map { it.kind }.toSet()
            if (alerts.state != OperatorAlertsState.Off && on.isNotEmpty()) return on - OperatorAlertKind.Unknown
            val before = known.filter { it.value in remembered.kinds }.toSet()
            return before.ifEmpty { known.toSet() }
        }
    }
}

/** "the engine stops being ready, jobs are failing or a report is waiting": the chosen kinds as the tray says them. */
fun alertsSentence(choices: List<OperatorAlertChoice>, chosen: Set<OperatorAlertKind>): String {
    val parts = choices.filter { it.kind in chosen }.map { it.label.replaceFirstChar(Char::lowercase) }
    return when (parts.size) {
        0 -> ""
        1 -> parts[0]
        else -> parts.dropLast(1).joinToString(", ") + " or " + parts.last()
    }
}

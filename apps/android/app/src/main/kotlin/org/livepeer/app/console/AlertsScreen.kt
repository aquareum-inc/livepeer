package org.livepeer.app.console

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.BasicText
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import org.livepeer.app.design.LoadFailure
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.PrimaryButton
import org.livepeer.app.design.SecondaryButton
import org.livepeer.app.design.pressable
import org.livepeer.app.design.style
import org.livepeer.app.generated.OperatorAlertChoice
import org.livepeer.app.generated.OperatorAlertKind
import org.livepeer.app.generated.TypeSize

/**
 * Alerts on this phone: whether it is told when something needs the operator, and about what. The switches
 * are a draft. Nothing changes until the page's one button is pressed and a fingerprint or face confirms it,
 * because every change needs its own match and three prompts for three switches would be absurd.
 */
@Composable
fun AlertsScreen(model: AlertsModel, unlocks: Int, onBack: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var change by remember { mutableStateOf<ConsoleChange?>(null) }

    // Read again each time the console is unlocked, and the phone's own settings each time the app comes back:
    // notifications may have been switched on or off in Settings since.
    LaunchedEffect(unlocks) { model.load() }
    LifecycleResumeEffect(Unit) {
        model.recheck()
        onPauseOrDispose {}
    }

    DetailPage("Alerts", onBack, refresh = model::load) {
        val phase = state.phase
        when {
            state.alerts != null -> AlertsBody(state, model) { change = it }
            phase is Phase.Failed -> LoadFailure(phase.message, Modifier.padding(top = 32.dp)) { scope.launch { model.load() } }
            else -> StandIn {
                Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
                    Words("Alerts are off on this phone.", TypeSize.Lead.style().copy(color = LocalPalette.current.foreground))
                    Choices(PLACEHOLDER, emptySet()) {}
                }
            }
        }
    }
    change?.let { ChangeTray(it) { change = null } }
}

@Composable
private fun ColumnScope.AlertsBody(state: AlertsState, model: AlertsModel, ask: (ConsoleChange) -> Unit) {
    val palette = LocalPalette.current
    val context = LocalContext.current
    val instance = LocalInstanceName.current
    val permit = rememberNotificationPermission()
    val standing = state.standing
    val lead = TypeSize.Lead.style().copy(color = palette.foreground)
    val quiet = TypeSize.Body.style().copy(color = palette.mutedForeground)

    when (standing) {
        AlertsStanding.NotOffered -> {
            Sentence("This service hasn't set up alerts for Android phones.", "They need push credentials on the server. Running ./livepeer doctor there says what is missing.")
            return
        }
        AlertsStanding.Unsupported -> {
            Sentence("This phone can't receive alerts.", "On Android they arrive through Google Play services, which this phone doesn't have.")
            return
        }
        AlertsStanding.Off -> Words("Alerts are off on this phone.", lead)
        AlertsStanding.On -> Words("This phone is told when something needs you.", lead)
        AlertsStanding.Blocked -> {
            Sentence("Notifications are off for $instance in Settings, so alerts can't show.", null)
            SecondaryButton("Open Settings") {
                context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
            }
        }
        AlertsStanding.Stopped -> Sentence("Alerts have stopped on this phone.", "Where they were sent no longer reaches it. Turning them back on mends that.")
        AlertsStanding.Unknown -> return
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Choices(state.choices, state.draft, model::toggle)
        Words("A phone being added to the console is always told.", quiet, Modifier.padding(horizontal = 4.dp))
    }

    val alerts = state.alerts
    if (alerts != null && (standing == AlertsStanding.On || standing == AlertsStanding.Blocked)) {
        val now = rememberNow(30_000)
        ConsoleSection("Now") {
            ConsoleFormat.millis(alerts.until)?.let {
                FactRow("Stops", "${ConsoleFormat.day(it)}, unless this phone signs in again")
                RowRule()
            }
            FactRow("Last alert", ConsoleFormat.millis(alerts.lastAlertAt)?.let { ConsoleFormat.ago(it, now) } ?: "None yet")
        }
    }

    // The page's one action: what the switches would do, said in a tray and confirmed with a match.
    state.action?.let { action ->
        PrimaryButton(action) {
            val turningOff = state.draft.isEmpty()
            val turningOn = standing == AlertsStanding.Off || standing == AlertsStanding.Stopped
            val told = "$instance will send a notification here when ${alertsSentence(state.choices, state.draft)}."
            ask(
                when {
                    turningOff -> turnOff(model, instance)
                    turningOn -> ConsoleChange("Turn on alerts on this phone?", "$told A notification never names a person or shows what was reported. Alerts stop when the console signs out on this phone.", "Turn on alerts", destructive = false) {
                        model.apply(instance, permit)
                    }
                    else -> ConsoleChange("Save these choices?", told, "Save changes", destructive = false) { model.apply(instance, permit) }
                },
            )
        }
    }

    if (standing == AlertsStanding.On || standing == AlertsStanding.Blocked) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (standing == AlertsStanding.On) TestAlert(state, model, instance)
            // Turning off takes nothing from anyone else, so it isn't red.
            SecondaryButton("Turn off alerts") { ask(turnOff(model, instance)) }
        }
    }

    Words("Alerts come from this service. If it is down, it can't tell you.", TypeSize.Caption.style().copy(color = palette.subtleForeground, textAlign = TextAlign.Center), Modifier.fillMaxWidth().padding(horizontal = 16.dp))
}

private fun turnOff(model: AlertsModel, instance: String) =
    ConsoleChange("Turn off alerts on this phone?", "This phone won't be told when something needs you. You can turn them back on at any time.", "Turn off alerts", destructive = false) { model.turnOff(instance) }

/** What the page has to say when there is nothing to choose: one sentence, and why. */
@Composable
private fun Sentence(sentence: String, why: String?) {
    val palette = LocalPalette.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Words(sentence, TypeSize.Lead.style().copy(color = palette.foreground))
        if (why != null) Words(why, TypeSize.Body.style().copy(color = palette.mutedForeground))
    }
}

/** One switch a kind, with the instance's own words. The switches are ink: green is never on a control. */
@Composable
private fun Choices(choices: List<OperatorAlertChoice>, chosen: Set<OperatorAlertKind>, toggle: (OperatorAlertKind) -> Unit) {
    val palette = LocalPalette.current
    ConsoleSection("Tell this phone when") {
        choices.forEachIndexed { index, choice ->
            if (index > 0) RowRule()
            Row(
                Modifier.fillMaxWidth().heightIn(min = 56.dp).toggleable(value = choice.kind in chosen, role = Role.Switch) { toggle(choice.kind) }.padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Words(choice.label, TypeSize.Lead.style().copy(color = palette.foreground), Modifier.weight(1f))
                if (!LocalStandIn.current) {
                    Switch(
                        checked = choice.kind in chosen,
                        onCheckedChange = null,
                        colors = SwitchDefaults.colors(checkedTrackColor = palette.primary, checkedThumbColor = palette.primaryForeground, uncheckedTrackColor = palette.muted, uncheckedThumbColor = palette.mutedForeground, uncheckedBorderColor = palette.hairline),
                    )
                }
            }
        }
    }
}

/** Sends this phone a test alert after a match, and says under it how that went. */
@Composable
private fun TestAlert(state: AlertsState, model: AlertsModel, instance: String) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var sending by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }
    val said = failure ?: when (state.tested) {
        true -> "Sent. It should arrive in a moment."
        false -> "It couldn't be delivered to this phone."
        null -> null
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).pressable(enabled = !sending) {
                sending = true
                failure = null
                scope.launch {
                    failure = (model.sendTest(instance) as? ChangeOutcome.Refused)?.message
                    sending = false
                }
            },
            contentAlignment = Alignment.Center,
        ) {
            BasicText("Send a test alert", style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.foreground, textAlign = TextAlign.Center))
        }
        if (said != null) {
            val wrong = failure != null || state.tested == false
            BasicText(said, style = TypeSize.Caption.style().copy(color = if (wrong) palette.destructive else palette.mutedForeground, textAlign = TextAlign.Center), modifier = Modifier.padding(bottom = 4.dp).semantics { liveRegion = LiveRegionMode.Polite })
        }
    }
}

/**
 * Asks the system whether notifications may show, the first time, at the moment alerts are turned on and never
 * before. Before Android 13 there is nothing to ask. Answers whether they may show now.
 */
@Composable
private fun rememberNotificationPermission(): suspend () -> Boolean {
    val context = LocalContext.current
    var waiting by remember { mutableStateOf<CompletableDeferred<Boolean>?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        waiting?.complete(granted)
        waiting = null
    }
    return remember(launcher) {
        suspend {
            val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            if (granted) {
                NotificationManagerCompat.from(context).areNotificationsEnabled()
            } else {
                val answer = CompletableDeferred<Boolean>()
                waiting = answer
                launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
                answer.await()
            }
        }
    }
}

/** Stands in while the first answer is on its way: the same rows, with nothing to read in them. */
private val PLACEHOLDER = listOf(
    OperatorAlertChoice(OperatorAlertKind.EngineNotReady, "The engine stops being ready", false),
    OperatorAlertChoice(OperatorAlertKind.JobsFailing, "Jobs are failing", false),
    OperatorAlertChoice(OperatorAlertKind.ReportsWaiting, "A report is waiting", false),
)

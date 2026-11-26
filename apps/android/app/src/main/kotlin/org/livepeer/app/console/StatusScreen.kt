package org.livepeer.app.console

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.PrimaryButton
import org.livepeer.app.design.pressable
import org.livepeer.app.design.style
import org.livepeer.app.generated.OperatorAttention
import org.livepeer.app.generated.OperatorAttentionKind
import org.livepeer.app.generated.OperatorAttentionOpens
import org.livepeer.app.generated.OperatorRole
import org.livepeer.app.generated.OperatorStatus
import org.livepeer.app.generated.OperatorStatusService
import org.livepeer.app.generated.OperatorStatusToday
import org.livepeer.app.generated.TypeSize

/** Whether a "Needs you" row leads somewhere other than the screen it is on. */
fun offersPlace(place: OperatorAttentionOpens): Boolean = place == OperatorAttentionOpens.Jobs || place == OperatorAttentionOpens.Reports

/** The console's first screen. It answers one question: is anything wrong? */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatusScreen(model: StatusModel, onBack: (() -> Unit)?, alerts: AlertsStanding, openAlerts: () -> Unit, signOut: suspend () -> Unit, open: (OperatorAttentionOpens) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }

    // Status has no title: its sentence is the title.
    ConsolePage(title = null, onBack = onBack) {
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = { scope.launch { refreshing = true; model.load(); refreshing = false } }, modifier = Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(top = 8.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                Headline(state) { scope.launch { model.load() } }
                val status = state.status
                if (status != null) {
                    Column(Modifier.alpha(if (state.trouble == null) 1f else 0.5f), verticalArrangement = Arrangement.spacedBy(24.dp)) { Sections(status, open) }
                } else if (state.trouble == null) {
                    // The same rows at their final height, so nothing moves when the answer arrives.
                    StandIn { Column(verticalArrangement = Arrangement.spacedBy(24.dp)) { Sections(PLACEHOLDER, open) } }
                }
                Column {
                    // What this phone knows for itself, so not a line in Needs you, whose lines are the instance's.
                    if (alerts == AlertsStanding.Stopped || alerts == AlertsStanding.Blocked) AlertsStopped(openAlerts)
                    SignOut(signOut, alertsOn = alerts == AlertsStanding.On || alerts == AlertsStanding.Blocked)
                }
            }
        }
    }
}

/** The sentence, what stands under it, and Try again when the answer didn't come. */
@Composable
private fun Headline(state: StatusState, retry: () -> Unit) {
    val now = rememberNow(1_000)
    val status = state.status
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        when (val trouble = state.trouble) {
            StatusState.Trouble.Unreachable -> {
                Sentence("Can't reach ${LocalInstanceName.current}.", Tone.Bad)
                Note(state.checked?.let { "Last checked ${ConsoleFormat.ago(it, now)}. Check your connection." } ?: "Check your connection.", mono = false)
                Retry(state.loading, retry)
            }
            is StatusState.Trouble.Refused -> {
                Sentence("The status didn't load.", Tone.Bad)
                Note(trouble.message, mono = false)
                Retry(state.loading, retry)
            }
            null -> if (status != null) {
                Sentence(ConsoleFormat.headline(status.attention.size), StatusModel.tone(status.attention))
                state.checked?.let { Note("Checked ${ConsoleFormat.ago(it, now)}", mono = true) }
            } else {
                Sentence("Checking…", Tone.Quiet)
                Note(" ", mono = true)
            }
        }
    }
}

@Composable
private fun Sentence(text: String, tone: Tone) {
    val palette = LocalPalette.current
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        LeadingDot(tone, TypeSize.Title, size = 12.dp)
        BasicText(text, style = TypeSize.Title.style(FontWeight.SemiBold).copy(color = palette.foreground), modifier = Modifier.semantics { heading() })
    }
}

@Composable
private fun Note(text: String, mono: Boolean) {
    BasicText(text, style = (if (mono) TypeSize.Caption else TypeSize.Body).style(mono = mono).copy(color = LocalPalette.current.mutedForeground), modifier = Modifier.padding(start = 24.dp))
}

@Composable
private fun Retry(busy: Boolean, retry: () -> Unit) {
    PrimaryButton("Try again", Modifier.padding(start = 24.dp, top = 10.dp).widthIn(max = 200.dp), busy = busy, onClick = retry)
}

/** Needs you, Today and Service. */
@Composable
private fun Sections(status: OperatorStatus, open: (OperatorAttentionOpens) -> Unit) {
    if (status.attention.isNotEmpty()) {
        ConsoleSection("Needs you") {
            status.attention.forEachIndexed { index, item ->
                if (index > 0) RowRule()
                AttentionRow(item, open)
            }
        }
    }
    val today = status.today
    ConsoleSection("Today") {
        FigureRow("Active users" to ConsoleFormat.count(today.activeUsers), "Running now" to ConsoleFormat.count(status.service.runningJobs))
        RowRule()
        FigureRow("Jobs" to ConsoleFormat.count(today.jobs), "Failed" to ConsoleFormat.count(today.failed))
        RowRule()
        FigureRow((if (today.revenueEstimated) "Revenue, estimated" else "Revenue") to ConsoleFormat.money(today.revenueUsd), "Margin" to ConsoleFormat.money(today.marginUsd))
    }
    val service = status.service
    val now = rememberNow(1_000)
    ConsoleSection("Service") {
        ServiceRow("Engine", service.engineReady, if (service.engineReady) "Ready" else "Not ready", seen = null, now = now)
        RowRule()
        ServiceRow("Discovery", service.discoveryFresh, if (service.discoveryFresh) "Fresh" else "Stale", ConsoleFormat.millis(service.discoveryObservedAt), now)
        RowRule()
        ServiceRow("Cost sync", service.costSyncError == null, if (service.costSyncError == null) "Synced" else "Failing", ConsoleFormat.millis(service.costSyncAt), now, detail = service.costSyncError)
        RowRule()
        FactRow("Engine version", service.engineVersion)
    }
}

/** One thing that needs the operator. It opens the place to deal with it, when this phone has that place. */
@Composable
private fun AttentionRow(item: OperatorAttention, open: (OperatorAttentionOpens) -> Unit) {
    val palette = LocalPalette.current
    val leads = offersPlace(item.opens)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).then(if (leads) Modifier.pressable { open(item.opens) } else Modifier).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        StateDot(if (item.kind == OperatorAttentionKind.ReportsWaiting) Tone.Ink else Tone.Bad)
        BasicText(item.message, style = TypeSize.Lead.style(FontWeight.Medium).copy(color = palette.foreground), modifier = Modifier.weight(1f))
        if (leads) Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = palette.subtleForeground, modifier = Modifier.size(20.dp))
    }
}

/** Two of today's figures side by side: a name over a number in mono. At the largest text sizes they stack. */
@Composable
private fun FigureRow(first: Pair<String, String>, second: Pair<String, String>) {
    val palette = LocalPalette.current
    if (largeText()) {
        Column {
            Figure(first, Modifier.fillMaxWidth())
            RowRule()
            Figure(second, Modifier.fillMaxWidth())
        }
    } else {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Figure(first, Modifier.weight(1f))
            Box(Modifier.width(1.dp).fillMaxHeight().background(palette.hairline))
            Figure(second, Modifier.weight(1f))
        }
    }
}

@Composable
private fun Figure(figure: Pair<String, String>, modifier: Modifier) {
    val palette = LocalPalette.current
    Column(modifier.semantics(mergeDescendants = true) {}.padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Words(figure.first, TypeSize.Caption.style().copy(color = palette.mutedForeground))
        RollingNumber(figure.second, TypeSize.Title.style(FontWeight.Medium, mono = true).copy(color = palette.foreground))
    }
}

/** One part of the service: its name, when it was last seen in mono, and its state as a dot with the word. */
@Composable
private fun ServiceRow(name: String, good: Boolean, word: String, seen: Long?, now: Long, detail: String? = null) {
    val palette = LocalPalette.current
    val nameText: @Composable (Modifier) -> Unit = { Words(name, TypeSize.Body.style().copy(color = palette.mutedForeground), it) }
    val age: @Composable () -> Unit = { seen?.let { Words(ConsoleFormat.ago(it, now), TypeSize.Caption.style(mono = true).copy(color = palette.subtleForeground)) } }
    val stateText: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StateDot(if (good) Tone.Good else Tone.Bad)
            Words(word, TypeSize.Body.style(FontWeight.Medium).copy(color = palette.foreground))
        }
    }
    Column(Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics(mergeDescendants = true) {}.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically)) {
        if (largeText()) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                nameText(Modifier)
                stateText()
                age()
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                nameText(Modifier.weight(1f))
                age()
                stateText()
            }
        }
        detail?.let { Words(it, TypeSize.Caption.style(mono = true).copy(color = palette.destructive)) }
    }
}

/** Alerts were on and no longer reach this phone. One quiet line, and the way to mend it. */
@Composable
private fun AlertsStopped(open: () -> Unit) {
    val palette = LocalPalette.current
    Box(Modifier.fillMaxWidth().heightIn(min = 48.dp).pressable(label = "Opens Alerts", onClick = open), contentAlignment = Alignment.Center) {
        BasicText("Alerts have stopped on this phone.", style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.foreground, textAlign = TextAlign.Center))
    }
}

/** The way out of the console for good on this phone, kept quiet at the foot of the first screen. */
@Composable
private fun SignOut(signOut: suspend () -> Unit, alertsOn: Boolean) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var confirming by rememberSaveable { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth().heightIn(min = 48.dp).pressable { confirming = true }, contentAlignment = Alignment.Center) {
        BasicText("Sign out of the console on this phone", style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.mutedForeground, textAlign = TextAlign.Center))
    }
    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text("Sign out of the console?") },
            text = { Text(if (alertsOn) "This phone forgets the console and its key. Alerts stop on this phone too. To come back you sign in again." else "This phone forgets the console and its key. To come back you sign in again.") },
            confirmButton = { TextButton({ confirming = false; scope.launch { signOut() } }) { Text("Sign out", color = palette.destructive) } },
            dismissButton = { TextButton({ confirming = false }) { Text("Cancel", color = palette.foreground) } },
            containerColor = palette.popover,
            titleContentColor = palette.foreground,
            textContentColor = palette.mutedForeground,
        )
    }
}

/** Stands in while the first answer is on its way: the same rows, with nothing to read in them. */
private val PLACEHOLDER = OperatorStatus(
    checkedAt = "",
    role = OperatorRole.Viewer,
    attention = emptyList(),
    today = OperatorStatusToday(activeUsers = 0.0, jobs = 0.0, failed = 0.0, revenueUsd = 0.0, wholesaleUsd = 0.0, marginUsd = 0.0, revenueEstimated = false),
    service = OperatorStatusService(engineReady = true, discoveryFresh = true, runningJobs = 0.0, engineVersion = "0.0.0"),
)

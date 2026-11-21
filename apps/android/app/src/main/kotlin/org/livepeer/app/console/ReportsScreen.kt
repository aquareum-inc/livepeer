package org.livepeer.app.console

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicText
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import org.livepeer.app.characters.label
import org.livepeer.app.design.LoadFailure
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.SecondaryButton
import org.livepeer.app.design.style
import org.livepeer.app.generated.CharacterReport
import org.livepeer.app.generated.CharacterReportState
import org.livepeer.app.generated.ReportReason
import org.livepeer.app.generated.TypeSize

/** Reports as a queue: what is waiting, longest first, then what was decided. Who reported is never shown. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportsScreen(model: ReportsModel, onBack: (() -> Unit)?, open: (CharacterReport) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val now = rememberNow(60_000)
    var refreshing by remember { mutableStateOf(false) }

    ConsolePage("Reports", onBack) {
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = { scope.launch { refreshing = true; model.load(); refreshing = false } }, modifier = Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
                when (val phase = state.phase) {
                    Phase.Loading -> item(key = "loading") {
                        StandIn { repeat(4) { ReportRow(REPORT_PLACEHOLDER, now); RowRule(36.dp) } }
                    }
                    is Phase.Failed -> item(key = "failed") { LoadFailure(phase.message, Modifier.padding(top = 32.dp)) { scope.launch { model.load() } } }
                    Phase.Loaded -> {
                        val waiting = state.waiting
                        val decided = state.decided
                        if (waiting.isEmpty()) item(key = "empty") { EmptyLine("No reports are waiting.", Modifier.padding(vertical = 40.dp)) } else rows(waiting, now, open)
                        if (decided.isNotEmpty()) {
                            item(key = "decided") {
                                BasicText("Decided", style = TypeSize.Caption.style(FontWeight.Medium).copy(color = palette.mutedForeground), modifier = Modifier.padding(horizontal = 16.dp).padding(top = 24.dp, bottom = 4.dp).semantics { heading() })
                            }
                            rows(decided, now, open)
                        }
                    }
                }
            }
        }
    }
}

private fun LazyListScope.rows(reports: List<CharacterReport>, now: Long, open: (CharacterReport) -> Unit) {
    // A decided report is a different row from the waiting one it was, not the same row moved.
    items(reports, key = { it.rowKey }) { report ->
        Box(Modifier.rowPress { open(report) }) { ReportRow(report, now) }
        RowRule(36.dp)
    }
}

/** One report: the character and when, the reason and the author in mono, then the reporter's own words. */
@Composable
fun ReportRow(report: CharacterReport, now: Long) {
    val palette = LocalPalette.current
    val large = largeText()
    val open = report.state == CharacterReportState.Open
    val title: @Composable (Modifier) -> Unit = { Words(report.characterName, TypeSize.Lead.style(FontWeight.Medium).copy(color = palette.foreground), it, maxLines = if (large) Int.MAX_VALUE else 1) }
    val at: @Composable () -> Unit = { Words(ConsoleFormat.millis(report.createdAt)?.let { ConsoleFormat.clock(it, now) }.orEmpty(), TypeSize.Caption.style(mono = true).copy(color = palette.subtleForeground)) }

    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).semantics(mergeDescendants = true) {}.padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        LeadingDot(if (open) Tone.Ink else Tone.Quiet)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            if (large) {
                title(Modifier)
                at()
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    title(Modifier.weight(1f))
                    at()
                }
            }
            Words(
                buildAnnotatedString {
                    withStyle(SpanStyle(color = if (open) palette.foreground else palette.mutedForeground)) { append(if (open) report.reason.label else report.state.word) }
                    append("${FACT_GAP}by\u00A0${report.author}")
                },
                TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground),
            )
            report.note?.takeIf { open && it.isNotEmpty() }?.let { note ->
                Words("“$note”", TypeSize.Body.style().copy(color = palette.mutedForeground), Modifier.padding(top = 2.dp), maxLines = if (large) Int.MAX_VALUE else 2)
            }
        }
    }
}

/**
 * One report, and the two things an operator can do about it. Each opens a tray that says what will happen;
 * nothing changes here until the instance has done it.
 */
@Composable
fun ReportDetailScreen(model: ReportsModel, id: String, onBack: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val palette = LocalPalette.current
    val instance = LocalInstanceName.current
    var change by remember { mutableStateOf<ConsoleChange?>(null) }
    // The report as it was when the page opened, kept in case the queue no longer lists it.
    var last by remember { mutableStateOf(state.report(id)) }
    val current = state.report(id)
    LaunchedEffect(current) { if (current != null) last = current }
    val report = current ?: last

    DetailPage("Report", onBack) {
        if (report == null) return@DetailPage
        val open = report.state == CharacterReportState.Open
        DetailHeader(report.characterName, if (open) Tone.Ink else if (report.state == CharacterReportState.Hidden) Tone.Bad else Tone.Quiet, report.state.word)
        report.note?.takeIf { it.isNotEmpty() }?.let { note ->
            ConsoleSection("In their words") {
                BasicText("“$note”", style = TypeSize.Lead.style().copy(color = palette.foreground), modifier = Modifier.fillMaxWidth().padding(16.dp))
            }
        }
        ConsoleSection("Report") {
            FactRow("Reason", report.reason.label)
            RowRule()
            FactRow("Character", report.characterSlug, copies = true)
            RowRule()
            FactRow("Author", report.author, copies = true)
            ConsoleFormat.millis(report.createdAt)?.let { RowRule(); FactRow("Reported", ConsoleFormat.moment(it)) }
        }
        if (open) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SecondaryButton("Keep it up") {
                    change = ConsoleChange("Keep ${report.characterName} up?", "It stays on $instance for everyone, and this report is closed.", "Keep it up", destructive = false) {
                        model.decide(report, ReportOutcome.Dismissed, instance)
                    }
                }
                OutlineDestructiveButton("Take it down") {
                    change = ConsoleChange(
                        "Take ${report.characterName} down?",
                        "No one on $instance will see it again, and its other open reports close. Its author keeps their other characters.",
                        "Take it down",
                        destructive = true,
                    ) { model.decide(report, ReportOutcome.Hidden, instance) }
                }
            }
        }
    }
    change?.let { ChangeTray(it) { change = null } }
}

/** Stands in for a row while the queue is on its way. */
private val REPORT_PLACEHOLDER = CharacterReport(
    id = "", characterSlug = "", characterName = "A character", author = "its-author", reason = ReportReason.Other,
    note = "What the person who reported it wrote.", createdAt = "2026-01-01T12:00:00Z", state = CharacterReportState.Open,
)

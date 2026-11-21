package org.livepeer.app.console

import android.content.Intent
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import org.livepeer.app.design.LoadFailure
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.pressable
import org.livepeer.app.design.style
import org.livepeer.app.generated.EngineJob
import org.livepeer.app.generated.EngineJobMode
import org.livepeer.app.generated.JobAttempt
import org.livepeer.app.generated.JobFailure
import org.livepeer.app.generated.JobState
import org.livepeer.app.generated.Radius
import org.livepeer.app.generated.TypeSize

/** Recent jobs as a list: two lines a row, filters as chips, older pages as the list is scrolled. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobsScreen(model: JobsModel, onBack: (() -> Unit)?, open: (EngineJob) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val now = rememberNow(60_000)
    var refreshing by remember { mutableStateOf(false) }

    ConsolePage("Jobs", onBack) {
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = { scope.launch { refreshing = true; model.load(); refreshing = false } }, modifier = Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
                item(key = "filters") {
                    // The chips scroll sideways at the largest text sizes rather than wrap.
                    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (filter in JobFilter.entries) FilterChip(filter.label, selected = state.filter == filter) { scope.launch { model.show(filter) } }
                    }
                }
                when (val phase = state.phase) {
                    Phase.Loading -> item(key = "loading") {
                        StandIn { repeat(8) { JobRow(JOB_PLACEHOLDER, now); RowRule(36.dp) } }
                    }
                    is Phase.Failed -> item(key = "failed") { LoadFailure(phase.message, Modifier.padding(top = 32.dp)) { scope.launch { model.load() } } }
                    Phase.Loaded -> if (state.jobs.isEmpty()) {
                        item(key = "empty") { EmptyLine(state.filter.emptyMessage, Modifier.padding(top = 56.dp)) }
                    } else {
                        items(state.jobs, key = { it.id }) { job ->
                            // Drawing the last row is what asks for the page before it.
                            if (job.id == state.jobs.last().id) LaunchedEffect(job.id) { model.loadMore() }
                            Box(Modifier.rowPress { open(job) }) { JobRow(job, now) }
                            RowRule(36.dp)
                        }
                        item(key = "foot") {
                            val failure = state.moreFailure
                            if (failure != null) {
                                LoadFailure(failure) { scope.launch { model.loadMore() } }
                            } else if (state.loadingMore) {
                                Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = LocalPalette.current.mutedForeground, strokeWidth = 2.dp, modifier = Modifier.size(22.dp)) }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** One job in two lines: what ran and when, then its state and facts in mono. */
@Composable
fun JobRow(job: EngineJob, now: Long) {
    val palette = LocalPalette.current
    val large = largeText()
    // Failed reads in the destructive colour and work in progress in ink; a finished job is as quiet as its facts.
    val stateColour = when (job.tone) {
        Tone.Bad -> palette.destructive
        Tone.Active, Tone.Ink -> palette.foreground
        Tone.Good, Tone.Quiet -> palette.mutedForeground
    }
    val title: @Composable (Modifier) -> Unit = { Words(ConsoleFormat.appName(job.app), TypeSize.Lead.style(FontWeight.Medium).copy(color = palette.foreground), it, maxLines = if (large) Int.MAX_VALUE else 1) }
    val at: @Composable () -> Unit = { Words(job.created?.let { ConsoleFormat.clock(it, now) }.orEmpty(), TypeSize.Caption.style(mono = true).copy(color = palette.subtleForeground)) }

    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).semantics(mergeDescendants = true) {}.padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        LeadingDot(job.tone)
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
                    withStyle(SpanStyle(color = stateColour)) { append(job.stateWord) }
                    append(FACT_GAP + job.facts.joinToString(FACT_GAP))
                },
                TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground),
                maxLines = if (large) Int.MAX_VALUE else 1,
            )
        }
    }
}

/** One job: what happened, the failure as it was written, and each attempt with the compute operator it went to. */
@Composable
fun JobDetailScreen(job: EngineJob, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val context = LocalContext.current
    DetailPage("Job", onBack, action = {
        Box(
            Modifier.size(48.dp).pressable(round = true) {
                context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, job.summary), null))
            }.semantics { contentDescription = "Share this job's summary" },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Rounded.Share, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(20.dp)) }
    }) {
        DetailHeader(ConsoleFormat.appName(job.app), if (job.state == JobState.Succeeded) Tone.Good else job.tone, job.stateLine, alarming = job.state == JobState.Failed || job.state == JobState.Uncertain)
        job.failure?.let { FailureCard(it) }
        ConsoleSection("Job") {
            FactRow("User", job.actorId, copies = true)
            job.model?.let { RowRule(); FactRow("Model", it) }
            job.created?.let { RowRule(); FactRow("Started", ConsoleFormat.moment(it)) }
            ConsoleFormat.millis(job.completedAt)?.let { RowRule(); FactRow("Finished", ConsoleFormat.moment(it)) }
            job.took?.let { RowRule(); FactRow("Took", ConsoleFormat.duration(it)) }
            RowRule()
            FactRow("Id", job.id, copies = true)
        }
        for (attempt in job.attempts) {
            ConsoleSection("Attempt ${ConsoleFormat.count(attempt.number)}") {
                FactRow("Outcome", outcome(attempt), tone = if (attempt.outcome == "succeeded") Tone.Good else if (attempt.endedAt == null) Tone.Active else Tone.Bad)
                ConsoleFormat.host(attempt.orchestratorUrl)?.let { RowRule(); FactRow("Compute operator", it, copies = true) }
                val start = ConsoleFormat.millis(attempt.startedAt)
                val end = ConsoleFormat.millis(attempt.endedAt)
                if (start != null && end != null) {
                    RowRule()
                    FactRow("Took", ConsoleFormat.duration((end - start) / 1000.0))
                }
                attempt.timings?.let { timings ->
                    timings.challengeMs?.let { RowRule(); FactRow("Challenge", ConsoleFormat.milliseconds(it)) }
                    timings.signingMs?.let { RowRule(); FactRow("Signing", ConsoleFormat.milliseconds(it)) }
                    timings.responseMs?.let { RowRule(); FactRow("Response", ConsoleFormat.milliseconds(it)) }
                }
                RowRule()
                FactRow("Payment", if (attempt.paymentSent) "Sent" else "Not sent")
            }
        }
    }
}

/** An attempt's outcome in words, with the status code the compute operator answered with. */
fun outcome(attempt: JobAttempt): String {
    val word = attempt.outcome.replace('_', ' ')
    return attempt.statusCode?.let { "$word · ${ConsoleFormat.count(it)}" } ?: word
}

/** A failure's facts in one line: its kind, the status code, the reason, and whether payment went. */
fun failureFacts(failure: JobFailure): String = buildList {
    add(failure.kind)
    failure.statusCode?.let { add(ConsoleFormat.count(it)) }
    failure.reason?.let { add(it) }
    add(if (failure.paymentSent) "payment sent" else "no payment sent")
}.joinToString(" · ")

/** Why a job failed, in the engine's own words, on a wash of the destructive colour: it reports, it doesn't ask. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FailureCard(failure: JobFailure) {
    val palette = LocalPalette.current
    val clipboard = LocalClipboard.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val shape = RoundedCornerShape(Radius.Card.dp)
    val facts = failureFacts(failure)
    Column(
        Modifier.fillMaxWidth().background(palette.destructive.copy(alpha = 0.12f), shape).border(1.dp, palette.destructive.copy(alpha = 0.4f), shape)
            .combinedClickable(
                interactionSource = null,
                indication = null,
                onLongClickLabel = "Copy",
                onLongClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    scope.launch { clipboard.setClipEntry(ClipEntry(android.content.ClipData.newPlainText("Failure", failure.message))) }
                },
                onClick = {},
            )
            .semantics(mergeDescendants = true) { contentDescription = "Failure: ${failure.message} $facts" }
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        BasicText(failure.message, style = TypeSize.Lead.style(FontWeight.Medium).copy(color = palette.foreground))
        BasicText(facts, style = TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground))
        failure.body?.takeIf { it.isNotEmpty() }?.let { BasicText(it, style = TypeSize.Caption.style(mono = true).copy(color = palette.foreground), modifier = Modifier.padding(top = 4.dp)) }
    }
}

/** Stands in for a row while the first page is on its way. */
private val JOB_PLACEHOLDER = EngineJob(
    id = "00000000", actorId = "", applicationId = "", mode = EngineJobMode.Immediate, app = "text-to-video", state = JobState.Succeeded,
    attempts = emptyList(), createdAt = "2026-01-01T12:00:00Z", completedAt = "2026-01-01T12:00:09Z",
)

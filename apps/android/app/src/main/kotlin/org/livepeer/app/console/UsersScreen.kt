package org.livepeer.app.console

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Search
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.livepeer.app.design.LoadFailure
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.PrimaryButton
import org.livepeer.app.design.pressable
import org.livepeer.app.design.style
import org.livepeer.app.generated.KnownActor
import org.livepeer.app.generated.TypeSize

/** Everyone who uses the instance, with a search field that is always there. Search runs on the instance. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UsersScreen(model: UsersModel, onBack: (() -> Unit)?, open: (KnownActor) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val now = rememberNow(60_000)
    var refreshing by remember { mutableStateOf(false) }
    // What was last searched for, so coming back to the page doesn't search again.
    var searched by remember { mutableStateOf(state.query) }

    // A moment after typing stops.
    LaunchedEffect(state.query) {
        if (state.query == searched) return@LaunchedEffect
        delay(250)
        searched = state.query
        model.load()
    }

    ConsolePage("Users", onBack) {
        BasicTextField(
            value = state.query,
            onValueChange = model::search,
            singleLine = true,
            textStyle = TypeSize.Lead.style().copy(color = palette.foreground),
            cursorBrush = SolidColor(palette.foreground),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Search),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 8.dp).semantics { contentDescription = "Search by name or id" },
            decorationBox = { field ->
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).background(palette.card, CircleShape).border(1.dp, palette.hairline, CircleShape).padding(start = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(20.dp))
                    Box(Modifier.weight(1f)) {
                        if (state.query.isEmpty()) BasicText("Name or id", style = TypeSize.Lead.style().copy(color = palette.subtleForeground))
                        field()
                    }
                    if (state.query.isNotEmpty()) {
                        Box(Modifier.size(48.dp).pressable(round = true) { model.search("") }.semantics { contentDescription = "Clear the search" }, contentAlignment = Alignment.Center) {
                            Icon(Icons.Rounded.Close, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            },
        )
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = { scope.launch { refreshing = true; model.load(); refreshing = false } }, modifier = Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
                when (val phase = state.phase) {
                    Phase.Loading -> item(key = "loading") {
                        StandIn { repeat(6) { UserRow(USER_PLACEHOLDER, now); RowRule(36.dp) } }
                    }
                    is Phase.Failed -> item(key = "failed") { LoadFailure(phase.message, Modifier.padding(top = 32.dp)) { scope.launch { model.load() } } }
                    Phase.Loaded -> if (state.users.isEmpty()) {
                        item(key = "empty") { EmptyLine(if (state.query.isBlank()) "No one has signed up yet." else "No one matches “${state.query}”.", Modifier.padding(top = 56.dp)) }
                    } else {
                        // A suspended account is a different row from the active one it was, so the list redraws it.
                        items(state.users, key = { it.rowKey }) { user ->
                            Box(Modifier.rowPress { open(user) }) { UserRow(user, now) }
                            RowRule(36.dp)
                        }
                    }
                }
            }
        }
    }
}

/** One user: their name and when they were last seen, then where the account stands and its id in mono. */
@Composable
fun UserRow(user: KnownActor, now: Long) {
    val palette = LocalPalette.current
    val large = largeText()
    // Suspended and revoked read in the destructive colour; an ordinary active account is as quiet as its id.
    val standingColour = when (user.tone) {
        Tone.Bad -> palette.destructive
        Tone.Ink, Tone.Active -> palette.foreground
        Tone.Good, Tone.Quiet -> palette.mutedForeground
    }
    val title: @Composable (Modifier) -> Unit = { Words(user.displayName, TypeSize.Lead.style(FontWeight.Medium).copy(color = palette.foreground), it, maxLines = if (large) Int.MAX_VALUE else 1) }
    val seen: @Composable () -> Unit = { Words(ConsoleFormat.millis(user.lastSeenAt)?.let { ConsoleFormat.ago(it, now) } ?: "never seen", TypeSize.Caption.style(mono = true).copy(color = palette.subtleForeground)) }

    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).semantics(mergeDescendants = true) {}.padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        LeadingDot(if (user.tone == Tone.Good) Tone.Quiet else user.tone)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            if (large) {
                title(Modifier)
                seen()
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    title(Modifier.weight(1f))
                    seen()
                }
            }
            Words(
                buildAnnotatedString {
                    withStyle(SpanStyle(color = standingColour)) { append(user.standing) }
                    append("$FACT_GAP${user.actorId}")
                },
                TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground),
                maxLines = if (large) Int.MAX_VALUE else 1,
                overflow = TextOverflow.MiddleEllipsis,
            )
        }
    }
}

/** One user, and the one thing a phone can do to their account: suspend it, or resume it. */
@Composable
fun UserDetailScreen(model: UsersModel, id: String, onBack: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val instance = LocalInstanceName.current
    var change by remember { mutableStateOf<ConsoleChange?>(null) }
    // The user as they were when the page opened, kept in case a new search no longer lists them.
    var last by remember { mutableStateOf(state.user(id)) }
    val current = state.user(id)
    LaunchedEffect(current) { if (current != null) last = current }
    val user = current ?: last

    DetailPage("User", onBack) {
        if (user == null) return@DetailPage
        DetailHeader(user.displayName, user.tone, user.standing, alarming = user.tone == Tone.Bad)
        ConsoleSection("Account") {
            FactRow("Id", user.actorId, copies = true)
            ConsoleFormat.millis(user.lastSeenAt)?.let { RowRule(); FactRow("Last seen", ConsoleFormat.moment(it)) }
            ConsoleFormat.millis(user.firstSeenAt)?.let { RowRule(); FactRow("First seen", ConsoleFormat.moment(it)) }
            RowRule()
            FactRow("Application", user.applicationId)
        }
        user.allocation?.let { allocation ->
            ConsoleSection("Allocation") {
                FactRow("Id", allocation.allocationId, copies = true)
                RowRule()
                FactRow("Grant", allocation.grantId, copies = true)
                RowRule()
                FactRow("Currency", allocation.currency)
                ConsoleFormat.millis(allocation.updatedAt)?.let { RowRule(); FactRow("Changed", ConsoleFormat.moment(it)) }
            }
        }
        if (user.canSuspend) {
            OutlineDestructiveButton("Suspend") {
                change = ConsoleChange("Suspend ${user.displayName}?", "Their work stops and their phones are signed out. You can resume them at any time.", "Suspend", destructive = true) {
                    model.set(user, UserStatus.Paused, instance)
                }
            }
        } else if (user.canResume) {
            PrimaryButton("Resume") {
                change = ConsoleChange("Resume ${user.displayName}?", "They can sign in and run work again.", "Resume", destructive = false) { model.set(user, UserStatus.Active, instance) }
            }
        }
    }
    change?.let { ChangeTray(it) { change = null } }
}

/** Stands in for a row while the list is on its way. */
private val USER_PLACEHOLDER = KnownActor(applicationId = "", actorId = "usr_0000000000", label = "A person's name", lastSeenAt = "2026-01-01T12:00:00Z", provisioned = true)

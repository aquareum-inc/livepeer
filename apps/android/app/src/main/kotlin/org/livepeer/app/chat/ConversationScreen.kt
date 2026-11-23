package org.livepeer.app.chat

import org.livepeer.app.design.orb.OrbState
import org.livepeer.app.design.orb.ThinkingOrb
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.FormatListBulleted
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import org.livepeer.app.design.Artwork
import org.livepeer.app.design.LoadFailure
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.aspectRatio
import org.livepeer.app.design.breathing
import org.livepeer.app.design.pressable
import org.livepeer.app.design.rememberMotion
import org.livepeer.app.design.style
import org.livepeer.app.generated.AgentMessage
import org.livepeer.app.generated.AgentMessageState
import org.livepeer.app.generated.AgentStep
import org.livepeer.app.generated.AgentStepKind
import org.livepeer.app.generated.AgentStepState
import org.livepeer.app.generated.Generation
import org.livepeer.app.generated.GenerationState
import org.livepeer.app.generated.Message
import org.livepeer.app.generated.Radius
import org.livepeer.app.generated.TypeSize
import org.livepeer.app.generated.UserMessage
import org.livepeer.app.generated.VideoMoment
import androidx.compose.material.icons.rounded.NorthEast
import org.livepeer.app.generated.MediaKind
import org.livepeer.app.composer.AttachTray
import org.livepeer.app.composer.CastTray
import org.livepeer.app.composer.ComposerSupport
import org.livepeer.app.composer.ComposerTray
import org.livepeer.app.design.Tray
import org.livepeer.app.design.absolute
import org.livepeer.app.home.Composer
import org.livepeer.app.home.ComposerChoices
import org.livepeer.app.home.ComposerInset
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import kotlin.math.roundToInt

@Composable
fun ConversationScreen(model: ConversationViewModel, support: ComposerSupport, casting: Boolean, composerModifier: Modifier, onBack: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val models by support.models.collectAsStateWithLifecycle()
    var tray by rememberSaveable { mutableStateOf<ComposerTray?>(null) }
    val palette = LocalPalette.current
    val list = rememberLazyListState()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val messages = state.conversation?.messages.orEmpty()

    // Follows while the screen is in front; a new message or coming back starts it again.
    LaunchedEffect(lifecycle, messages.size) { lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) { model.follow() } }
    // Keep the newest thing in view: a new message, and a shot's tile when it first appears.
    LaunchedEffect(messages.size, state.generations.size) { if (messages.isNotEmpty()) list.animateScrollToItem(messages.lastIndex, Int.MAX_VALUE / 2) }

    Column(Modifier.fillMaxSize().background(palette.background)) {
        Row(Modifier.windowInsetsPadding(WindowInsets.statusBars).fillMaxWidth().height(56.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(48.dp).pressable(round = true, onClick = onBack).semantics { contentDescription = "Back" }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(22.dp))
            }
            BasicText(
                state.conversation?.title.orEmpty(),
                style = TypeSize.Lead.style(FontWeight.SemiBold).copy(color = palette.foreground),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 4.dp, end = 16.dp).semantics { heading() },
            )
        }

        Box(Modifier.weight(1f)) {
            if (state.loadFailed) {
                LoadFailure("This conversation didn't load.", Modifier.padding(top = 80.dp)) { model.retry() }
            } else {
                LazyColumn(state = list, contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(24.dp), modifier = Modifier.fillMaxSize()) {
                    items(messages, key = { message -> when (message) { is Message.User -> message.value.id; is Message.Agent -> message.value.id } }) { message ->
                        when (message) {
                            is Message.User -> UserBubble(message.value)
                            is Message.Agent -> AgentTurn(message.value, state.generations, state.labels, state.draft.aspect)
                        }
                    }
                }
            }
        }

        Column(Modifier.windowInsetsPadding(WindowInsets.navigationBars.union(WindowInsets.ime)).padding(horizontal = ComposerInset).padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            state.sendError?.let { BasicText(it, style = TypeSize.Caption.style().copy(color = palette.destructive)) }
            Composer(
                state.draft,
                model::setDraft,
                onSend = model::send,
                modifier = composerModifier,
                placeholder = "Ask for a change, or describe the next shot…",
                sending = state.sending,
                choices = ComposerChoices(models, casting, attach = { tray = ComposerTray.Attach }, castCharacter = { tray = ComposerTray.Cast }),
            )
        }
    }

    when (tray) {
        ComposerTray.Attach -> Tray("Attach a photo or video", onDismiss = { tray = null }) { close -> AttachTray(support, state.draft, model::setDraft, close) }
        ComposerTray.Cast -> Tray("Put a character in it", onDismiss = { tray = null }) { close -> CastTray(support, state.draft, model::setDraft, close) }
        null -> {}
    }
}

@Composable
private fun UserBubble(message: UserMessage) {
    val palette = LocalPalette.current
    val shape = RoundedCornerShape(Radius.Card.dp)
    Column(Modifier.fillMaxWidth().padding(start = 48.dp), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        message.cast?.let { cast ->
            Row(Modifier.semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.size(20.dp).clip(CircleShape).background(palette.secondary), contentAlignment = Alignment.Center) {
                    BasicText(cast.name.take(1), style = TypeSize.Caption.style(FontWeight.SemiBold).copy(color = palette.foreground))
                    cast.image?.let { AsyncImage(absolute(it), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
                }
                BasicText("With ${cast.name}", style = TypeSize.Caption.style(FontWeight.Medium).copy(color = palette.mutedForeground))
            }
        }
        SelectionContainer {
            BasicText(message.text, style = TypeSize.Lead.style().copy(color = palette.foreground), modifier = Modifier.background(palette.card, shape).border(1.dp, palette.hairline, shape).padding(horizontal = 16.dp, vertical = 10.dp))
        }
    }
}

/**
 * One turn of the agent. While it works each tool call is a step; when it finishes the steps fold
 * to one line that opens again in place. Shots appear under the steps that made them.
 */
@Composable
private fun AgentTurn(turn: AgentMessage, generations: Map<String, Generation>, labels: Map<String, String>, aspect: String) {
    val palette = LocalPalette.current
    val motion = rememberMotion()
    val working = turn.state == AgentMessageState.Working
    var expanded by rememberSaveable(turn.id) { mutableStateOf(false) }
    val open = working || expanded

    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        // The agent's orb: it shows what kind of work is happening, and holds still once the turn is done.
        Box(Modifier.size(28.dp), contentAlignment = Alignment.Center) {
            ThinkingOrb(if (working) orbState(turn.steps.firstOrNull { it.state == AgentStepState.Running }) else OrbState.Breathing, paused = !working)
        }
        Column(Modifier.weight(1f).animateContentSize(motion.morph()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (working) {
                val running = turn.steps.firstOrNull { it.state == AgentStepState.Running }
                BasicText("${running?.title ?: "Starting"}…", style = TypeSize.Body.style().copy(color = palette.mutedForeground), modifier = Modifier.heightIn(min = 28.dp).padding(top = 4.dp).breathing())
            } else {
                val seconds = maxOf(1, (turn.elapsedMs / 1000).roundToInt())
                Row(
                    Modifier.pressable(label = if (expanded) "Hide the steps" else "Show the steps") { expanded = !expanded }.heightIn(min = 28.dp).semantics { stateDescription = if (expanded) "Expanded" else "Collapsed" },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    BasicText("Worked for ${seconds}s · ${turn.steps.size} ${if (turn.steps.size == 1) "step" else "steps"}", style = TypeSize.Body.style().copy(color = palette.mutedForeground))
                    Icon(Icons.Rounded.ExpandMore, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(18.dp).rotate(if (expanded) 180f else 0f))
                }
            }
            AnimatedVisibility(open && turn.steps.isNotEmpty()) {
                Column { turn.steps.forEachIndexed { index, step -> StepRow(step, step.app?.let { labels[it] ?: it }, last = index == turn.steps.lastIndex) } }
            }
            for (id in turn.generationIds) {
                val generation = generations[id]
                GenerationTile(generation, generation?.request?.aspect?.value ?: aspect)
                if (generation?.state == GenerationState.Succeeded) {
                    val open = LocalOpenInStudio.current
                    Row(Modifier.heightIn(min = 40.dp).pressable(label = "Open in the studio") { open(generation.request.kind, generation.request.prompt) }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.Rounded.NorthEast, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(16.dp))
                        BasicText("Open in the studio", style = TypeSize.Caption.style(FontWeight.Medium).copy(color = palette.mutedForeground))
                    }
                }
            }
            turn.analysis?.moments?.takeIf { it.isNotEmpty() }?.let { MomentList(it) }
            turn.text?.let { SelectionContainer { BasicText(it, style = TypeSize.Lead.style().copy(color = palette.foreground)) } }
        }
    }
}

@Composable
private fun StepRow(step: AgentStep, label: String?, last: Boolean) {
    val palette = LocalPalette.current
    val icon = when {
        step.state == AgentStepState.Done -> Icons.Rounded.Check
        step.kind == AgentStepKind.Plan -> Icons.AutoMirrored.Rounded.FormatListBulleted
        step.kind == AgentStepKind.Review -> Icons.Rounded.Visibility
        else -> Icons.Rounded.Build
    }
    Row(
        Modifier
            .alpha(if (step.state == AgentStepState.Pending) 0.4f else 1f)
            // The line that joins a step to the next, from under its mark to the top of the following one.
            .drawBehind { if (!last) drawLine(palette.border, Offset(12.dp.toPx(), 28.dp.toPx()), Offset(12.dp.toPx(), size.height - 4.dp.toPx()), 1.dp.toPx()) }
            .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(24.dp).border(1.dp, palette.hairline, CircleShape).breathing(step.state == AgentStepState.Running), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = if (step.state == AgentStepState.Running) palette.foreground else palette.mutedForeground, modifier = Modifier.size(13.dp))
        }
        Column(Modifier.padding(bottom = if (last) 0.dp else 16.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            BasicText(step.title, style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.foreground))
            if (label != null) {
                BasicText(label, style = TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground), modifier = Modifier.background(palette.active, CircleShape).padding(horizontal = 7.dp, vertical = 2.dp))
            }
            BasicText(step.detail, style = TypeSize.Caption.style().copy(color = palette.mutedForeground))
        }
    }
}

/**
 * A result is one tile from request to finish: present from the start, soft and breathing while it
 * renders, then the same tile sharpens. Finishing is marked once, with a green ring and a tap.
 */
@Composable
fun GenerationTile(generation: Generation?, aspect: String) {
    val palette = LocalPalette.current
    val haptics = LocalHapticFeedback.current
    val shape = RoundedCornerShape(Radius.Media.dp)
    val rendering = generation?.state.let { it == null || it == GenerationState.Queued || it == GenerationState.Running }
    val failed = generation?.state == GenerationState.Failed
    val ring = remember { Animatable(0f) }
    var seen by remember { mutableStateOf(generation?.state) }

    LaunchedEffect(generation?.state) {
        val before = seen
        seen = generation?.state
        if (generation?.state == GenerationState.Succeeded && (before == GenerationState.Queued || before == GenerationState.Running)) {
            haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            ring.snapTo(1f)
            ring.animateTo(0f, tween(1400))
        }
    }

    val percent = ((generation?.progress ?: 0.0) * 100).roundToInt()
    val description = when {
        generation == null -> "Shot, queued"
        generation.state == GenerationState.Succeeded -> "Shot: ${generation.request.prompt}"
        failed -> "This shot didn't render"
        else -> "Shot, rendering, $percent percent"
    }
    Box(Modifier.fillMaxWidth().aspectRatio(aspectRatio(aspect)).clip(shape).border(1.dp, palette.hairline, shape).border(2.dp, palette.brand.copy(alpha = ring.value), shape).clearAndSetSemantics { contentDescription = description }) {
        if (generation == null) {
            Box(Modifier.fillMaxSize().background(palette.card).breathing())
        } else {
            Artwork(
                generation.artwork,
                Modifier.fillMaxSize().breathing(rendering).blur(if (rendering) 18.dp else 0.dp).graphicsLayer {
                    alpha = if (failed) 0.35f else 1f
                    if (failed) colorFilter = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) })
                },
            )
        }
        val caption = when {
            failed -> "Didn't render"
            generation == null || generation.state == GenerationState.Queued -> "Queued"
            rendering -> "$percent%"
            else -> generation.request.durationSeconds?.let { "${it.toInt()}s" }
        }
        if (caption != null) {
            BasicText(caption, style = TypeSize.Caption.style(mono = true).copy(color = Color.White), modifier = Modifier.align(Alignment.BottomStart).padding(10.dp).background(Color.Black.copy(alpha = 0.45f), CircleShape).padding(horizontal = 8.dp, vertical = 4.dp))
        }
    }
}

/** The moments a video analysis found, each with where it is. */
@Composable
private fun MomentList(moments: List<VideoMoment>) {
    val palette = LocalPalette.current
    val open = LocalOpenInStudio.current
    val shape = RoundedCornerShape(Radius.Card.dp)
    Column(Modifier.clip(shape).border(1.dp, palette.hairline, shape)) {
        moments.forEachIndexed { index, moment ->
            Row(
                Modifier.fillMaxWidth().pressable(label = "Open the studio to extend this moment") { open(MediaKind.Video, "Extend the moment “${moment.label}”, keeping the same subject and light") }.padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                val whole = moment.atSeconds.toInt()
                BasicText("${whole / 60}:${(whole % 60).toString().padStart(2, '0')}", style = TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground), modifier = Modifier.width(48.dp).background(palette.active, CircleShape).padding(vertical = 3.dp, horizontal = 8.dp))
                BasicText(moment.label, style = TypeSize.Body.style().copy(color = palette.foreground), modifier = Modifier.weight(1f))
                Icon(Icons.Rounded.NorthEast, contentDescription = null, tint = palette.subtleForeground, modifier = Modifier.size(14.dp))
            }
            if (index < moments.lastIndex) Box(Modifier.fillMaxWidth().height(1.dp).background(palette.hairline))
        }
    }
}

/** Opens the studio on a medium with words to start from. The shell provides it; a conversation calls it. */
val LocalOpenInStudio = androidx.compose.runtime.staticCompositionLocalOf<(MediaKind, String) -> Unit> { { _, _ -> } }

package org.livepeer.app.home

import android.view.HapticFeedbackConstants
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.material.icons.outlined.AccountBox
import androidx.compose.material.icons.outlined.SmartToy
import androidx.compose.material.icons.rounded.AccountBox
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import org.livepeer.app.design.absolute
import org.livepeer.app.generated.AgentModelEntry
import org.livepeer.app.generated.CharacterCast
import org.livepeer.app.generated.MediaItem
import coil3.compose.AsyncImage
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.glass
import org.livepeer.app.design.pressable
import org.livepeer.app.design.rememberMotion
import org.livepeer.app.design.style
import org.livepeer.app.generated.Radius
import org.livepeer.app.generated.TypeSize

/** What the composer holds before it is sent. */
data class Draft(
    val prompt: String = "",
    /** The capability a starting point, an example or a cast chose; null lets the agent decide. */
    val app: String? = null,
    val aspect: String = "16:9",
    val durationSeconds: Int = 5,
    /** Library items for the agent to watch or work from. */
    val attachments: List<MediaItem> = emptyList(),
    /** A character to put on screen, starting from their portrait. */
    val cast: CharacterCast? = null,
    /** The language model that runs the agent; null is Auto. */
    val model: String? = null,
) {
    val isVideo: Boolean get() = app?.contains("video") == true && app?.startsWith("live") == false
    val canSend: Boolean get() = prompt.isNotBlank() || attachments.isNotEmpty()

    /** What is sent. With only attachments, it asks for the videos to be understood, as the web does. */
    val text: String get() = prompt.trim().ifEmpty { "Summarise this and list the key moments." }

    /** What carries on to the next message in a conversation: the same model, and the same cast. */
    val carriedOn: Draft get() = Draft(app = if (cast == null) null else app, cast = cast, model = model)
}

/** What the composer can offer besides words, as the instance describes it. */
data class ComposerChoices(
    /** The agent's model menu; shown only with two or more rows. */
    val models: List<AgentModelEntry> = emptyList(),
    /** Whether a character can be put on screen. */
    val casting: Boolean = false,
    val attach: () -> Unit = {},
    val castCharacter: () -> Unit = {},
)

private val ASPECTS = listOf("16:9", "9:16", "1:1")
private val DURATIONS = listOf(5, 10)

/** The composer's inset from the screen's edges, on Home and in a conversation, so it never moves between them. */
val ComposerInset = 16.dp

/**
 * The one composer. It sits at the foot of Home and at the foot of a conversation, and holds the
 * view's one ink action: send. Words go on top; everything else sits in one row beneath them.
 */
@Composable
fun Composer(
    draft: Draft,
    onDraft: (Draft) -> Unit,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "A slow push along a harbour at first light…",
    sending: Boolean = false,
    focus: FocusRequester = remember { FocusRequester() },
    choices: ComposerChoices = ComposerChoices(),
) {
    val palette = LocalPalette.current
    val motion = rememberMotion()
    val keyboard = LocalSoftwareKeyboardController.current
    val shape = RoundedCornerShape(Radius.Sheet.dp)
    val chosenModel = draft.model?.let { model -> choices.models.takeIf { it.size >= 2 }?.firstOrNull { it.app == model || model in it.also } }
    // The tool icons are one size and grow together with the reader's text size, up to 1.3 times.
    val iconScale = LocalDensity.current.fontScale.coerceAtMost(1.3f)
    Column(
        modifier
            .fillMaxWidth()
            .glass(shape)
            // Any part of the composer that isn't a control starts typing.
            .pointerInput(Unit) { detectTapGestures { focus.requestFocus(); keyboard?.show() } }
            .padding(8.dp),
    ) {
        AnimatedVisibility(draft.cast != null || draft.attachments.isNotEmpty(), enter = expandVertically(motion.morph()) + fadeIn(motion.morph()), exit = shrinkVertically(motion.exit()) + fadeOut(motion.exit())) {
            Chosen(draft, onDraft)
        }
        // Words that arrive from outside (a cleared draft) put the cursor at their end.
        var field by remember { mutableStateOf(TextFieldValue(draft.prompt, TextRange(draft.prompt.length))) }
        if (field.text != draft.prompt) field = TextFieldValue(draft.prompt, TextRange(draft.prompt.length))
        BasicTextField(
            value = field,
            onValueChange = { field = it; if (it.text != draft.prompt) onDraft(draft.copy(prompt = it.text)) },
            textStyle = TypeSize.Lead.style().copy(color = palette.foreground),
            cursorBrush = SolidColor(palette.brand),
            maxLines = 6,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 10.dp, end = 10.dp, top = 8.dp, bottom = 4.dp)
                .focusRequester(focus)
                // With a keyboard attached, Control-Enter sends and Enter adds a line.
                .onPreviewKeyEvent { event ->
                    val sends = event.type == KeyEventType.KeyDown && event.key == Key.Enter && (event.isCtrlPressed || event.isMetaPressed)
                    if (sends && draft.canSend && !sending) onSend()
                    sends
                }
                .semantics { contentDescription = "Describe what you want to make" },
            decorationBox = { inner ->
                Box {
                    if (draft.prompt.isEmpty()) BasicText(placeholderFor(draft, placeholder), style = TypeSize.Lead.style().copy(color = palette.subtleForeground))
                    inner()
                }
            },
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            // The tools take what send leaves; a long model name gives way before anything is pushed off the row.
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Tool(Icons.Rounded.Add, "Attach from your library", iconScale, on = false, onClick = choices.attach)
                if (choices.casting) {
                    // A framed portrait: theirs becomes the first frame. It fills in once someone is cast.
                    Tool(if (draft.cast == null) Icons.Outlined.AccountBox else Icons.Rounded.AccountBox, "Put a character in it", iconScale, on = draft.cast != null, onClick = choices.castCharacter)
                }
                if (choices.models.size >= 2) ModelMenu(draft, choices, chosenModel, iconScale, onDraft, Modifier.weight(1f, fill = false))
                // Parameters appear with intent: only once the request is a video.
                AnimatedVisibility(draft.isVideo, enter = expandHorizontally(motion.morph()) + fadeIn(motion.morph()), exit = shrinkHorizontally(motion.exit()) + fadeOut(motion.exit())) {
                    Row {
                        Parameter(draft.aspect, "Shape, ${draft.aspect}", ASPECTS.map { it to it }) { onDraft(draft.copy(aspect = it)) }
                        Parameter("${draft.durationSeconds}s", "Length, ${draft.durationSeconds} seconds", DURATIONS.map { "$it seconds" to it }) { onDraft(draft.copy(durationSeconds = it)) }
                    }
                }
            }
            SendButton(draft.canSend, sending, onSend)
        }
    }
}

/** What to write, given what has been added: a cast asks for a scene, an attachment for a question. */
private fun placeholderFor(draft: Draft, fallback: String): String = when {
    draft.cast != null -> "Put ${draft.cast.name} in a scene: where, doing what, in what light…"
    draft.attachments.isNotEmpty() -> "Ask about it, or send as it is for a summary and the key moments"
    else -> fallback
}

/** One of the composer's tools: an icon in a 48dp target, brighter once it has been used. */
@Composable
private fun Tool(icon: ImageVector, label: String, scale: Float, on: Boolean, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Box(Modifier.size(48.dp).pressable(round = true, label = label, onClick = onClick).semantics { contentDescription = label }, contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = if (on) palette.foreground else palette.mutedForeground, modifier = Modifier.size((22 * scale).dp))
    }
}

/** The language model that runs the agent, by name, with the menu to change it. */
@Composable
private fun ModelMenu(draft: Draft, choices: ComposerChoices, chosen: AgentModelEntry?, scale: Float, onDraft: (Draft) -> Unit, modifier: Modifier) {
    val palette = LocalPalette.current
    var open by remember { mutableStateOf(false) }
    val name = chosen?.name ?: "Auto"
    val tint = if (chosen != null) palette.foreground else palette.mutedForeground
    Box(modifier) {
        Row(
            Modifier.heightIn(min = 48.dp).pressable(label = "Choose the model") { open = true }.semantics(mergeDescendants = true) { contentDescription = "Model, $name" }.padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Icon(Icons.Outlined.SmartToy, contentDescription = null, tint = tint, modifier = Modifier.size((22 * scale).dp))
            // A long name is cut short rather than pushing send off the row.
            BasicText(name, style = TypeSize.Body.style(FontWeight.Medium).copy(color = tint), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            Icon(Icons.Rounded.ExpandMore, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = palette.popover) {
            ModelItem("Auto", "Picks a model for each request", draft.model == null) { open = false; onDraft(draft.copy(model = null)) }
            for (entry in choices.models) {
                ModelItem(entry.name, if (entry.busy) "Busy · ${entry.description}" else entry.description, chosen?.app == entry.app) { open = false; onDraft(draft.copy(model = entry.app)) }
            }
        }
    }
}

@Composable
private fun ModelItem(name: String, description: String, selected: Boolean, onClick: () -> Unit) {
    val palette = LocalPalette.current
    DropdownMenuItem(
        text = {
            Column {
                BasicText(name, style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.popoverForeground))
                BasicText(description, style = TypeSize.Caption.style().copy(color = palette.mutedForeground))
            }
        },
        leadingIcon = { Icon(Icons.Rounded.Check, null, tint = if (selected) palette.foreground else androidx.compose.ui.graphics.Color.Transparent) },
        onClick = onClick,
        modifier = Modifier.semantics { this.selected = selected },
    )
}

/** What has been added, each removable: who is cast and what is attached. */
@Composable
private fun Chosen(draft: Draft, onDraft: (Draft) -> Unit) {
    LazyRow(Modifier.padding(start = 6.dp, bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        draft.cast?.let { cast ->
            item(key = "cast") {
                Token(cast.name.take(1).uppercase(), cast.image, "With ${cast.name}", "Take ${cast.name} out") {
                    onDraft(draft.copy(cast = null, app = if (draft.app == "image-to-video") null else draft.app))
                }
            }
        }
        items(draft.attachments, key = { it.id }) { attached ->
            Token(null, attached.image, attached.title, "Remove ${attached.title}") { onDraft(draft.copy(attachments = draft.attachments - attached)) }
        }
    }
}

@Composable
private fun Token(initial: String?, image: String?, label: String, remove: String, onRemove: () -> Unit) {
    val palette = LocalPalette.current
    Row(
        Modifier.background(palette.hover, CircleShape).border(1.dp, palette.hairline, CircleShape).heightIn(min = 32.dp).padding(start = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(20.dp).clip(CircleShape).background(palette.secondary), contentAlignment = Alignment.Center) {
            if (initial != null) BasicText(initial, style = TypeSize.Caption.style(FontWeight.SemiBold).copy(color = palette.foreground, fontSize = 10.sp))
            if (image != null) AsyncImage(absolute(image), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        }
        BasicText(label, style = TypeSize.Caption.style(FontWeight.Medium).copy(color = palette.foreground), maxLines = 1)
        Box(Modifier.size(32.dp).pressable(round = true, label = remove, onClick = onRemove).semantics { contentDescription = remove }, contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.Close, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(14.dp))
        }
    }
}

/** The view's one ink action. With nothing to send it is a quiet well, not a faded ink button. */
@Composable
private fun SendButton(enabled: Boolean, sending: Boolean, onSend: () -> Unit) {
    val palette = LocalPalette.current
    val view = LocalView.current
    val ready = enabled && !sending
    val inked = ready || sending
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(48.dp)
            .pressable(enabled = ready, round = true) { view.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK); onSend() }
            .padding(2.dp)
            .background(if (inked) palette.primary else palette.active, CircleShape)
            .semantics { contentDescription = if (sending) "Sending" else "Send" },
    ) {
        // A send can't be stopped from here, so it shows that it is working rather than a stop sign.
        if (sending) CircularProgressIndicator(color = palette.primaryForeground, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
        else Icon(Icons.Rounded.ArrowUpward, contentDescription = null, tint = if (inked) palette.primaryForeground else palette.subtleForeground, modifier = Modifier.size(22.dp))
    }
}

/** A setting of the shot, as a small pill in a 48dp target. */
@Composable
private fun <T> Parameter(label: String, description: String, options: List<Pair<String, T>>, onPick: (T) -> Unit) {
    val palette = LocalPalette.current
    var open by remember { mutableStateOf(false) }
    Box {
        Box(Modifier.heightIn(min = 48.dp).pressable(label = description) { open = true }.semantics { contentDescription = description }.padding(horizontal = 3.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.background(palette.hover, CircleShape).border(1.dp, palette.hairline, CircleShape).heightIn(min = 32.dp).padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                BasicText(label, style = TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground))
            }
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = palette.popover) {
            for ((name, value) in options) {
                DropdownMenuItem(text = { BasicText(name, style = TypeSize.Body.style().copy(color = palette.popoverForeground)) }, onClick = { open = false; onPick(value) })
            }
        }
    }
}

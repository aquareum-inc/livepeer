package org.livepeer.app.console

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.livepeer.app.design.BrandSymbol
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.VectorMark
import org.livepeer.app.design.breathing
import org.livepeer.app.design.pressable
import org.livepeer.app.design.rememberMotion
import org.livepeer.app.design.style
import org.livepeer.app.generated.Radius
import org.livepeer.app.generated.TypeSize

/** The instance's mark, for the console's label and cover. */
val LocalInstanceMark = compositionLocalOf<VectorMark?> { null }

/** The instance's name, as the console's sentences say it. */
val LocalInstanceName = compositionLocalOf { "" }

/** True while a group stands in for rows that are on their way: words are drawn as bars of the same size. */
val LocalStandIn = compositionLocalOf { false }

/** Whether text is large enough that a row's facts move under what they describe. */
@Composable
fun largeText(): Boolean = LocalDensity.current.fontScale > 1.3f

/** The time now, read again every [every] milliseconds, so ages on screen stay current. */
@Composable
fun rememberNow(every: Long): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(every) {
        while (true) {
            delay(every)
            now = System.currentTimeMillis()
        }
    }
    return now
}

/** Text in the console. In a group that is standing in for loading rows it is a bar of the same size. */
@Composable
fun Words(text: String, style: TextStyle, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE, overflow: TextOverflow = TextOverflow.Ellipsis) {
    Words(AnnotatedString(text), style, modifier, maxLines, overflow)
}

@Composable
fun Words(text: AnnotatedString, style: TextStyle, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE, overflow: TextOverflow = TextOverflow.Ellipsis) {
    val bar = if (LocalStandIn.current) LocalPalette.current.active else null
    BasicText(
        text,
        style = style,
        maxLines = maxLines,
        overflow = overflow,
        modifier = if (bar == null) modifier else modifier.drawWithContent {
            val inset = size.height * 0.2f
            drawRoundRect(bar, Offset(0f, inset), Size(size.width, size.height - inset * 2), CornerRadius(4.dp.toPx()))
        },
    )
}

/** Rows of the final height with nothing to read in them, breathing, while the first answer is on its way. */
@Composable
fun StandIn(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalStandIn provides true) {
        Column(Modifier.breathing().clearAndSetSemantics {}) { content() }
    }
}

/** The instance's mark and CONSOLE in small mono capitals: the standing label that says this is not the user app. */
@Composable
fun ConsoleLabel(modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    Row(modifier.clearAndSetSemantics { contentDescription = "Console"; heading() }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        BrandSymbol(LocalInstanceMark.current, LocalInstanceName.current, palette.foreground, Modifier.size(18.dp))
        BasicText("CONSOLE", style = barStyle(TypeSize.Caption, FontWeight.Medium, mono = true).copy(color = palette.mutedForeground, letterSpacing = 1.6.sp))
    }
}

/** Text in the console's bar. Bars don't grow with the text size past a point, so neither does this. */
@Composable
fun barStyle(size: TypeSize, weight: FontWeight, mono: Boolean = false): TextStyle {
    val scale = LocalDensity.current.fontScale
    val held = scale.coerceAtMost(1.3f) / scale
    return size.style(weight, mono).let { it.copy(fontSize = it.fontSize * held, lineHeight = it.lineHeight * held) }
}

/**
 * A console root: the label where the user app has its title, and the way back where the avatar sits; then the
 * page's title, when it has one, and what it shows.
 */
@Composable
fun ConsolePage(title: String?, onBack: (() -> Unit)?, content: @Composable ColumnScope.() -> Unit) {
    val palette = LocalPalette.current
    Column(Modifier.fillMaxSize().background(palette.background).windowInsetsPadding(WindowInsets.statusBars)) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            ConsoleLabel(Modifier.weight(1f))
            // An instance with no user app has nowhere to go back to.
            if (onBack != null) {
                Box(Modifier.heightIn(min = 48.dp).pressable(onClick = onBack).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    BasicText("Back to the app", style = barStyle(TypeSize.Body, FontWeight.Medium).copy(color = palette.foreground))
                }
            }
        }
        if (title != null) {
            BasicText(title, style = TypeSize.Title.style(FontWeight.Bold).copy(color = palette.foreground, fontSize = 32.sp, lineHeight = 38.sp), modifier = Modifier.padding(horizontal = 16.dp).padding(bottom = 8.dp).semantics { heading() })
        }
        content()
    }
}

/** A pushed page: a back button, a short title, and room for one action; then what it shows, scrolling. */
@Composable
fun DetailPage(title: String, onBack: () -> Unit, action: @Composable () -> Unit = {}, content: @Composable ColumnScope.() -> Unit) {
    val palette = LocalPalette.current
    Column(Modifier.fillMaxSize().background(palette.background).windowInsetsPadding(WindowInsets.statusBars)) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(48.dp).pressable(round = true, onClick = onBack).semantics { contentDescription = "Back" }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(22.dp))
            }
            BasicText(title, style = barStyle(TypeSize.Lead, FontWeight.SemiBold).copy(color = palette.foreground), modifier = Modifier.weight(1f).padding(start = 4.dp).semantics { heading() })
            action()
        }
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(top = 8.dp, bottom = 24.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(24.dp),
            content = content,
        )
    }
}

/** A page's own heading: what it is, then its state as a dot with the words. */
@Composable
fun DetailHeader(title: String, tone: Tone, state: String, alarming: Boolean = false) {
    val palette = LocalPalette.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BasicText(title, style = TypeSize.Title.style(FontWeight.SemiBold).copy(color = palette.foreground), modifier = Modifier.semantics { heading() })
        Row(Modifier.semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StateDot(tone)
            BasicText(state, style = TypeSize.Body.style(FontWeight.Medium).copy(color = if (alarming) palette.destructive else palette.foreground))
        }
    }
}

/** A state as a dot. Always beside the word for it, never the only sign. It grows with the text, to a point. */
@Composable
fun StateDot(tone: Tone, modifier: Modifier = Modifier, size: Dp = 8.dp) {
    val palette = LocalPalette.current
    val colour = when {
        LocalStandIn.current -> palette.active
        tone == Tone.Good -> palette.brand
        tone == Tone.Bad -> palette.destructive
        tone == Tone.Active || tone == Tone.Ink -> palette.foreground
        else -> palette.subtleForeground
    }
    Box(modifier.size(size * LocalDensity.current.fontScale.coerceIn(1f, 2f)).breathing(tone == Tone.Active && !LocalStandIn.current).background(colour, CircleShape))
}

/** A dot placed beside the first line of a row whose first line is set in [line]. */
@Composable
fun LeadingDot(tone: Tone, line: TypeSize = TypeSize.Lead, size: Dp = 8.dp) {
    val density = LocalDensity.current
    val height = with(density) { line.line.sp.toDp() }
    Box(Modifier.height(height), contentAlignment = Alignment.Center) { StateDot(tone, size = size) }
}

/** A titled group: a small heading over a card of rows. */
@Composable
fun ConsoleSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    val palette = LocalPalette.current
    val shape = RoundedCornerShape(Radius.Card.dp)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Words(title, TypeSize.Caption.style(FontWeight.Medium).copy(color = palette.mutedForeground), Modifier.padding(horizontal = 4.dp).semantics { heading() })
        Column(Modifier.fillMaxWidth().background(palette.card, shape).border(1.dp, palette.hairline, shape), content = content)
    }
}

/** The line between two rows of a card. */
@Composable
fun RowRule(start: Dp = 16.dp) {
    Box(Modifier.fillMaxWidth().padding(start = start).height(1.dp).background(LocalPalette.current.hairline))
}

/**
 * One fact: what it is, then its value in mono. A value too long for the line, and every value at the largest
 * text sizes, moves under its name. A value that can be copied is copied by a long press.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FactRow(name: String, value: String, copies: Boolean = false, tone: Tone? = null) {
    val palette = LocalPalette.current
    val clipboard = LocalClipboard.current
    val haptics = LocalHapticFeedback.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val measurer = rememberTextMeasurer()
    val nameStyle = TypeSize.Body.style().copy(color = palette.mutedForeground)
    val valueStyle = TypeSize.Body.style(mono = true).copy(color = palette.foreground)
    val large = largeText()

    BoxWithConstraints(
        Modifier.fillMaxWidth().heightIn(min = 48.dp)
            .then(
                if (copies) {
                    Modifier.combinedClickable(
                        interactionSource = null,
                        indication = null,
                        onLongClickLabel = "Copy",
                        onLongClick = {
                            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                            scope.launch { clipboard.setClipEntry(ClipEntry(android.content.ClipData.newPlainText(name, value))) }
                        },
                        onClick = {},
                    )
                } else {
                    Modifier
                },
            )
            .semantics(mergeDescendants = true) {}
            .padding(horizontal = 16.dp, vertical = 12.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        val room = constraints.maxWidth
        val needed = remember(name, value, room, nameStyle, valueStyle) {
            measurer.measure(name, nameStyle, maxLines = 1).size.width + measurer.measure(value, valueStyle, maxLines = 1).size.width
        }
        val gap = with(LocalDensity.current) { (if (tone == null) 16.dp else 36.dp).roundToPx() }
        if (large || needed + gap > room) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Words(name, nameStyle)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (tone != null) StateDot(tone)
                    Words(value, valueStyle)
                }
            }
        } else {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Words(name, nameStyle, Modifier.weight(1f))
                if (tone != null) StateDot(tone, Modifier.padding(end = 8.dp))
                Words(value, valueStyle, maxLines = 1)
            }
        }
    }
}

/** A filter above a list. Selected is a filled chip with an ink edge; it is never the view's main action. */
@Composable
fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Box(Modifier.heightIn(min = 48.dp).pressable(onClick = onClick).semantics { this.selected = selected }, contentAlignment = Alignment.Center) {
        Box(
            Modifier.heightIn(min = 36.dp).background(if (selected) palette.active else palette.card, CircleShape).border(1.dp, if (selected) palette.foreground.copy(alpha = 0.5f) else palette.hairline, CircleShape).padding(horizontal = 16.dp),
            contentAlignment = Alignment.Center,
        ) {
            BasicText(label, style = TypeSize.Body.style(FontWeight.Medium).copy(color = if (selected) palette.foreground else palette.mutedForeground))
        }
    }
}

/** A list row's press: it darkens under the finger and doesn't shrink, as a row is part of the page. */
fun Modifier.rowPress(label: String? = null, onClick: () -> Unit): Modifier = composed {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    background(if (pressed) LocalPalette.current.hover else Color.Transparent)
        .clickable(interactionSource = source, indication = null, onClickLabel = label, role = Role.Button, onClick = onClick)
}

/** A change offered on a detail page, in outline and in the destructive colour. Nothing happens until its tray is confirmed. */
@Composable
fun OutlineDestructiveButton(label: String, onClick: () -> Unit) {
    val palette = LocalPalette.current
    val shape = RoundedCornerShape(Radius.Field.dp)
    Box(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).background(palette.card, shape).border(1.dp, palette.destructive.copy(alpha = 0.4f), shape).pressable(onClick = onClick).padding(12.dp),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(label, style = TypeSize.Lead.style(FontWeight.Medium).copy(color = palette.destructive, textAlign = TextAlign.Center))
    }
}

/** The one action in a tray that takes something away: solid, in the destructive colour. */
@Composable
fun DestructiveButton(label: String, busy: Boolean = false, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Box(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).background(palette.destructiveFill, RoundedCornerShape(Radius.Field.dp)).pressable(enabled = !busy, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(label, style = TypeSize.Lead.style(FontWeight.SemiBold).copy(color = Color.White, textAlign = TextAlign.Center), modifier = Modifier.alpha(if (busy) 0f else 1f).padding(12.dp))
        if (busy) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
    }
}

/** A number in mono that rolls only the digits that changed. With animations off it changes in place. */
@Composable
fun RollingNumber(text: String, style: TextStyle, modifier: Modifier = Modifier) {
    if (LocalStandIn.current) {
        Words(text, style, modifier)
        return
    }
    val motion = rememberMotion()
    Row(modifier.clearAndSetSemantics { this.text = AnnotatedString(text) }) {
        text.forEachIndexed { index, character ->
            // Counted from the right, so a digit keeps its place as the number grows.
            key(text.length - index) {
                AnimatedContent(
                    character,
                    transitionSpec = {
                        if (motion.reduce || !targetState.isDigit() || !initialState.isDigit()) {
                            fadeIn(motion.enter()) togetherWith fadeOut(motion.exit())
                        } else {
                            (slideInVertically(motion.enter()) { it } + fadeIn(motion.enter())) togetherWith (slideOutVertically(motion.exit()) { -it } + fadeOut(motion.exit()))
                        }
                    },
                    label = "digit",
                ) { shown -> BasicText(shown.toString(), style = style, maxLines = 1) }
            }
        }
    }
}

/** Between two facts on a line. It holds to the fact before it, so a wrapped line never starts with a dot. */
const val FACT_GAP = "\u00A0· "

/** What a list says when there is nothing in it. */
@Composable
fun EmptyLine(message: String, modifier: Modifier = Modifier) {
    BasicText(message, style = TypeSize.Lead.style().copy(color = LocalPalette.current.mutedForeground, textAlign = TextAlign.Center), modifier = modifier.fillMaxWidth().padding(horizontal = 24.dp))
}

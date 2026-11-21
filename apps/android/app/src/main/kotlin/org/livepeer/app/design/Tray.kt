package org.livepeer.app.design

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import org.livepeer.app.generated.Radius
import org.livepeer.app.generated.TypeSize
import kotlinx.coroutines.launch

/**
 * A tray: one thing, opened by an action, over the screen it came from, which stays visible and dimmed.
 * A fixed header holds the title and one icon. The tray is as tall as what it holds and scrolls only when
 * that is taller than the screen, as at the largest font sizes. A tray that asks for something to be taken away
 * is washed with the destructive colour: its tint carries the stakes. While [locked] answers true, it can't be closed.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Tray(title: String, onDismiss: () -> Unit, destructive: Boolean = false, locked: () -> Boolean = { false }, content: @Composable ColumnScope.(close: () -> Unit) -> Unit) {
    val palette = LocalPalette.current
    val held by rememberUpdatedState(locked)
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { it != SheetValue.Hidden || !held() })
    val scope = rememberCoroutineScope()
    val close: () -> Unit = { if (!held()) scope.launch { state.hide() }.invokeOnCompletion { onDismiss() } }

    ModalBottomSheet(
        onDismissRequest = { if (!held()) onDismiss() },
        sheetState = state,
        shape = RoundedCornerShape(topStart = Radius.Sheet.dp, topEnd = Radius.Sheet.dp),
        containerColor = if (destructive) palette.destructive.copy(alpha = 0.12f).compositeOver(palette.panel) else palette.panel,
        scrimColor = palette.overlay,
        dragHandle = null,
    ) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            BasicText(title, style = TypeSize.Lead.style(FontWeight.SemiBold).copy(color = palette.foreground), modifier = Modifier.weight(1f).semantics { heading() })
            Box(Modifier.size(48.dp).pressable(round = true, label = "Close", onClick = close), contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.Close, contentDescription = "Close", tint = palette.mutedForeground, modifier = Modifier.background(palette.active, CircleShape).padding(7.dp).size(16.dp))
            }
        }
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 8.dp, bottom = 20.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) { content(close) }
    }
}

/** The one ink action in a view: full width, filled with the primary colour. */
@Composable
fun PrimaryButton(label: String, modifier: Modifier = Modifier, enabled: Boolean = true, busy: Boolean = false, onClick: () -> Unit) {
    val palette = LocalPalette.current
    val shape = RoundedCornerShape(Radius.Field.dp)
    Box(
        modifier.fillMaxWidth().heightIn(min = 52.dp).background(palette.primary.copy(alpha = if (enabled) 1f else 0.4f), shape).pressable(enabled = enabled && !busy, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(label, style = TypeSize.Lead.style(FontWeight.SemiBold).copy(color = palette.primaryForeground, textAlign = TextAlign.Center), modifier = Modifier.alpha(if (busy) 0f else 1f).padding(12.dp))
        if (busy) CircularProgressIndicator(color = palette.primaryForeground, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
    }
}

/** A full-width button that isn't the main action: outlined, on the card colour. */
@Composable
fun SecondaryButton(label: String, icon: ImageVector? = null, enabled: Boolean = true, busy: Boolean = false, onClick: () -> Unit) {
    val palette = LocalPalette.current
    val shape = RoundedCornerShape(Radius.Field.dp)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).background(palette.card, shape).border(1.dp, palette.hairline, shape).pressable(enabled = enabled && !busy, onClick = onClick).padding(12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (busy) {
            CircularProgressIndicator(color = palette.foreground, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        } else {
            if (icon != null) {
                Icon(icon, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(20.dp))
                Spacer(Modifier.size(8.dp))
            }
            BasicText(label, style = TypeSize.Lead.style(FontWeight.Medium).copy(color = palette.foreground, textAlign = TextAlign.Center))
        }
    }
}

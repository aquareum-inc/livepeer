package org.livepeer.app.design

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import org.livepeer.app.generated.Motion
import org.livepeer.app.generated.TypeSize

/** A tap target with press feedback and no ripple: text buttons settle to 0.97, round ones to 0.92. */
fun Modifier.pressable(enabled: Boolean = true, round: Boolean = false, label: String? = null, onClick: () -> Unit): Modifier = composed {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val motion = rememberMotion()
    val scale by animateFloatAsState(if (pressed && !motion.reduce) (if (round) 0.92f else 0.97f) else 1f, tween(Motion.Exit, easing = EaseOutExpo), label = "press")
    graphicsLayer { scaleX = scale; scaleY = scale; alpha = if (pressed && motion.reduce) 0.7f else 1f }
        .clickable(interactionSource = source, indication = null, enabled = enabled, onClickLabel = label, role = Role.Button, onClick = onClick)
}

/**
 * Glass for controls that sit over footage: a see-through fill with a bright edge and a soft shadow.
 * Compose can't blur what is behind a control on every supported Android version, so the fill carries it.
 */
fun Modifier.glass(shape: Shape): Modifier = composed {
    val palette = LocalPalette.current
    shadow(elevation = 10.dp, shape = shape, ambientColor = androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.3f), spotColor = androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.3f))
        .background(palette.card.copy(alpha = 0.82f), shape)
        .background(palette.glassFill, shape)
        .border(1.dp, palette.glassEdge, shape)
        .border(1.dp, palette.hairline, shape)
}

/** Opacity that breathes while something is in progress. Still, at full strength, with animations off. */
fun Modifier.breathing(active: Boolean = true): Modifier = composed {
    if (!active || rememberMotion().reduce) return@composed this
    val alpha by rememberInfiniteTransition(label = "breathe").animateFloat(1f, 0.55f, infiniteRepeatable(tween(1200), RepeatMode.Reverse), label = "breathe")
    alpha(alpha)
}

/** A pill that selects something. Never the primary action. */
@Composable
fun Chip(label: String, icon: ImageVector? = null, selected: Boolean = false, enabled: Boolean = true, hint: String? = null, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .glass(CircleShape)
            .then(if (selected) Modifier.border(1.dp, palette.foreground.copy(alpha = 0.45f), CircleShape) else Modifier)
            .pressable(enabled = enabled, label = hint, onClick = onClick)
            .semantics { this.selected = selected }
            .heightIn(min = 36.dp)
            .padding(horizontal = 14.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = palette.foreground.copy(alpha = 0.85f), modifier = Modifier.size(16.dp))
        BasicText(label, style = TypeSize.Body.style(FontWeight.Medium).copy(color = if (selected) palette.foreground else palette.foreground.copy(alpha = 0.85f)))
    }
}

/** What a screen shows when its data didn't load. */
@Composable
fun LoadFailure(message: String, modifier: Modifier = Modifier, retry: () -> Unit) {
    val palette = LocalPalette.current
    Column(modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        BasicText(message, style = TypeSize.Body.style().copy(color = palette.mutedForeground, textAlign = TextAlign.Center))
        BasicText(
            "Try again",
            style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.foreground),
            modifier = Modifier.pressable(onClick = retry).background(palette.card, CircleShape).border(1.dp, palette.border, CircleShape).heightIn(min = 48.dp).padding(horizontal = 16.dp, vertical = 14.dp),
        )
    }
}

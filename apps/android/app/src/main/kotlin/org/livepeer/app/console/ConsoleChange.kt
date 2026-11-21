package org.livepeer.app.console

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.PrimaryButton
import org.livepeer.app.design.Tray
import org.livepeer.app.design.style
import org.livepeer.app.generated.TypeSize

/**
 * A change an operator is about to make, as the tray puts it to them: what will happen, to whom, and whether
 * it can be undone. One action, named for what it does.
 */
class ConsoleChange(
    val title: String,
    val message: String,
    val action: String,
    /** Takes something away: the tray is tinted and the button is red. */
    val destructive: Boolean,
    /** Makes the change, asking for a fingerprint or face on the way. */
    val run: suspend () -> ChangeOutcome,
)

/**
 * Puts a change to the operator in a tray. Pressing its button asks for a fingerprint or face; the tray closes
 * only when the instance has made the change, and says why when it hasn't.
 */
@Composable
fun ChangeTray(change: ConsoleChange, onClose: () -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var working by remember(change) { mutableStateOf(false) }
    var failure by remember(change) { mutableStateOf<String?>(null) }

    Tray(change.title, onDismiss = onClose, destructive = change.destructive, locked = { working }) { close ->
        val confirm: () -> Unit = {
            working = true
            failure = null
            scope.launch {
                val outcome = change.run()
                working = false
                when (outcome) {
                    ChangeOutcome.Done -> close()
                    ChangeOutcome.Cancelled -> Unit
                    is ChangeOutcome.Refused -> failure = outcome.message
                }
            }
        }
        BasicText(change.message, style = TypeSize.Lead.style().copy(color = palette.foreground), modifier = Modifier.padding(bottom = 4.dp))
        failure?.let { BasicText(it, style = TypeSize.Body.style().copy(color = palette.destructive), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
        if (change.destructive) DestructiveButton(change.action, busy = working, onClick = confirm) else PrimaryButton(change.action, busy = working, onClick = confirm)
    }
}

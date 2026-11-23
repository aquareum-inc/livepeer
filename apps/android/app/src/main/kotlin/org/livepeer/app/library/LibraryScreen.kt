package org.livepeer.app.library

import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Chat
import androidx.compose.material.icons.rounded.AutoAwesomeMosaic
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.SearchOff
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.livepeer.app.chat.LocalOpenInStudio
import org.livepeer.app.design.Chip
import org.livepeer.app.design.LoadFailure
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.MediaStill
import org.livepeer.app.design.PrimaryButton
import org.livepeer.app.design.SecondaryButton
import org.livepeer.app.design.Tray
import org.livepeer.app.design.aspectRatio
import org.livepeer.app.design.breathing
import org.livepeer.app.design.pressable
import org.livepeer.app.design.style
import org.livepeer.app.generated.Conversation
import org.livepeer.app.generated.MediaItem
import org.livepeer.app.generated.MediaItemSource
import org.livepeer.app.generated.MediaKind
import org.livepeer.app.generated.Radius
import org.livepeer.app.generated.TypeSize
import org.livepeer.app.shell.EmptyState
import org.livepeer.app.shell.SignedOutState
import org.livepeer.app.shell.TabPage
import kotlinx.coroutines.launch

private val KINDS = listOf<Pair<MediaKind?, String>>(null to "All", MediaKind.Video to "Video", MediaKind.Image to "Image", MediaKind.Audio to "Audio")

private fun ratio(item: MediaItem): Float = if (item.kind == MediaKind.Audio) 16f / 7f else aspectRatio(item.aspect.value)

/** Everything the person has made or added, newest first, searchable by what is in it. A guest sees what the library is for. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(model: LibraryViewModel, workspace: String?, signIn: () -> Unit, accountButton: @Composable () -> Unit, openConversation: (Conversation) -> Unit) {
    val palette = LocalPalette.current
    val state by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    var selected by rememberSaveable { mutableStateOf<String?>(null) }

    TabPage("Library", accountButton) {
        if (!state.signedIn) {
            SignedOutState(Icons.Rounded.GridView, "Your library", "Everything you make is kept here, searchable by what's in it. Sign in to see yours.", signIn)
            return@TabPage
        }
        BasicTextField(
            value = state.query,
            onValueChange = model::setQuery,
            singleLine = true,
            textStyle = TypeSize.Lead.style().copy(color = palette.foreground),
            cursorBrush = SolidColor(palette.foreground),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).semantics { contentDescription = "Search your library by what's in it" },
            decorationBox = { field ->
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).background(palette.card, CircleShape).border(1.dp, palette.hairline, CircleShape).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(20.dp))
                    Box { if (state.query.isEmpty()) BasicText("A runner at night, neon, harbour…", style = TypeSize.Lead.style().copy(color = palette.subtleForeground), maxLines = 1); field() }
                }
            },
        )
        LazyRow(Modifier.padding(top = 12.dp), contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(KINDS, key = { it.second }) { (kind, label) -> Chip(label, selected = state.kind == kind) { model.setKind(kind) } }
        }
        state.actionError?.let { BasicText(it, style = TypeSize.Caption.style().copy(color = palette.destructive), modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) }

        Box(Modifier.weight(1f).padding(top = 12.dp)) {
            when {
                state.loading -> Skeleton()
                state.failed -> LoadFailure("Your library didn't load. Check your connection and try again.", Modifier.fillMaxSize()) { model.retry() }
                state.items.isEmpty() && state.filtered -> EmptyState(Icons.Rounded.SearchOff, "Nothing matches", "Try describing what's on screen: a place, an action, a colour, a time of day.")
                state.items.isEmpty() -> EmptyState(
                    Icons.Rounded.AutoAwesomeMosaic,
                    workspace?.let { "$it's library is empty" } ?: "Your library is empty",
                    if (workspace == null) "Shots you make on Home or in the studio are saved here." else "Shots anyone here makes on Home or in the studio are saved here, for everyone in the workspace.",
                )
                else -> PullToRefreshBox(refreshing, onRefresh = { scope.launch { refreshing = true; model.refresh(); refreshing = false } }) {
                    LazyVerticalStaggeredGrid(
                        StaggeredGridCells.Fixed(2),
                        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalItemSpacing = 10.dp,
                        modifier = Modifier.alpha(if (state.searching) 0.6f else 1f),
                    ) {
                        items(state.items, key = { it.id }) { item -> Tile(item) { selected = item.id } }
                    }
                }
            }
        }
    }

    state.items.firstOrNull { it.id == selected }?.let { item ->
        Tray(item.title, onDismiss = { selected = null }) { close -> ItemTray(item, model, close, openConversation) }
    }
}

@Composable
private fun Tile(item: MediaItem, open: () -> Unit) {
    val shape = RoundedCornerShape(Radius.Media.dp)
    val palette = LocalPalette.current
    Box(Modifier.fillMaxWidth().aspectRatio(ratio(item)).clip(shape).border(1.dp, palette.hairline, shape).pressable(label = "Show what's in it", onClick = open).clearAndSetSemantics { contentDescription = "${item.title}, ${item.kind.value}" }) {
        MediaStill(item.image, item.artwork, Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.45f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.65f))))
        Row(Modifier.padding(8.dp).background(Color.Black.copy(alpha = 0.45f), CircleShape).padding(horizontal = 8.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(when (item.kind) { MediaKind.Image -> Icons.Rounded.Image; MediaKind.Audio -> Icons.Rounded.GraphicEq; else -> Icons.Rounded.PlayArrow }, contentDescription = null, tint = Color.White, modifier = Modifier.size(11.dp))
            BasicText(item.durationSeconds?.let { "${it.toInt()}s" } ?: item.kind.value, style = TypeSize.Caption.style(mono = true).copy(color = Color.White))
        }
        BasicText(item.title, style = TypeSize.Body.style(FontWeight.Medium).copy(color = Color.White), maxLines = if (LocalDensity.current.fontScale > 1.3f) 1 else 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.align(Alignment.BottomStart).padding(10.dp))
    }
}

/** One item: what is in it, and what can be done with it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ItemTray(item: MediaItem, model: LibraryViewModel, close: () -> Unit, openConversation: (Conversation) -> Unit) {
    val palette = LocalPalette.current
    val openInStudio = LocalOpenInStudio.current
    val scope = rememberCoroutineScope()
    var asking by remember { mutableStateOf(false) }
    var confirming by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(Radius.Media.dp)

    MediaStill(item.image, item.artwork, Modifier.fillMaxWidth().aspectRatio(if (item.kind == MediaKind.Audio) 16f / 7f else 16f / 9f).clip(shape).border(1.dp, palette.hairline, shape))
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BasicText("What's in it", style = TypeSize.Caption.style(FontWeight.Medium).copy(color = palette.subtleForeground))
        BasicText(item.description, style = TypeSize.Body.style().copy(color = palette.foreground))
        if (item.tags.isNotEmpty()) {
            FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (tag in item.tags) BasicText(tag, style = TypeSize.Caption.style().copy(color = palette.mutedForeground), modifier = Modifier.background(palette.secondary, CircleShape).padding(horizontal = 8.dp, vertical = 4.dp))
            }
        }
        // In a workspace's library, who made it.
        item.madeBy?.let { BasicText("${if (item.source == MediaItemSource.Upload) "Added" else "Made"} by $it", style = TypeSize.Caption.style().copy(color = palette.mutedForeground), modifier = Modifier.padding(top = 4.dp)) }
    }
    PrimaryButton("Open in the studio") {
        close()
        openInStudio(item.kind, LibraryViewModel.studioPrompt(item))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) {
            SecondaryButton(if (asking) "Starting…" else "Ask about it", Icons.AutoMirrored.Rounded.Chat, enabled = !asking) {
                asking = true
                scope.launch {
                    val conversation = model.ask(item)
                    asking = false
                    if (conversation != null) {
                        close()
                        openConversation(conversation)
                    }
                }
            }
        }
        val square = RoundedCornerShape(Radius.Field.dp)
        Box(Modifier.size(52.dp).background(palette.card, square).border(1.dp, palette.hairline, square).pressable(label = "Delete") { confirming = true }.semantics { contentDescription = "Delete" }, contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.Delete, contentDescription = null, tint = palette.destructive)
        }
    }
    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text("Delete this from your library?") },
            text = { Text("It can't be brought back.") },
            confirmButton = { TextButton({ confirming = false; close(); model.delete(item) }) { Text("Delete", color = palette.destructive) } },
            dismissButton = { TextButton({ confirming = false }) { Text("Keep it", color = palette.foreground) } },
            containerColor = palette.popover,
            titleContentColor = palette.foreground,
            textContentColor = palette.mutedForeground,
        )
    }
}

/** The grid's shape while it loads. */
@Composable
private fun Skeleton() {
    val palette = LocalPalette.current
    Row(Modifier.padding(horizontal = 16.dp).breathing(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        for (column in 0..1) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                for (row in 0..2) Box(Modifier.fillMaxWidth().aspectRatio(if ((row + column) % 2 == 0) 16f / 9f else 1f).background(palette.card, RoundedCornerShape(Radius.Media.dp)))
            }
        }
    }
}

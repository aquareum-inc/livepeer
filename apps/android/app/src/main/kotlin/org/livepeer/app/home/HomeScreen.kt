package org.livepeer.app.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DocumentScanner
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import kotlinx.coroutines.launch
import org.livepeer.app.account.Account
import org.livepeer.app.composer.AttachTray
import org.livepeer.app.composer.CastTray
import org.livepeer.app.composer.ComposerSupport
import org.livepeer.app.composer.ComposerTray
import org.livepeer.app.design.Chip
import org.livepeer.app.design.LoadFailure
import org.livepeer.app.design.LocalDarkTheme
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.Tray
import org.livepeer.app.design.glass
import org.livepeer.app.design.pressable
import org.livepeer.app.design.rememberMotion
import org.livepeer.app.design.style
import org.livepeer.app.generated.Conversation
import org.livepeer.app.generated.InstanceDescription
import org.livepeer.app.generated.TypeSize

private val STARTER_ICONS = mapOf("make-video" to Icons.Rounded.Movie, "animate-image" to Icons.Rounded.PhotoLibrary, "understand-video" to Icons.Rounded.DocumentScanner, "restyle-live" to Icons.Rounded.Sensors)

/**
 * Home is the composer's page. The headline holds the middle, and the composer sits at the foot, in the
 * thumb's reach and where it also sits in a conversation, with the starting points in one row above it.
 * The page doesn't scroll.
 */
@Composable
fun HomeScreen(model: HomeViewModel, account: Account, support: ComposerSupport, instance: InstanceDescription?, composerModifier: Modifier, accountButton: @Composable () -> Unit, openHistory: () -> Unit, onOpen: (Conversation) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val models by support.models.collectAsStateWithLifecycle()
    val signedIn by account.signedIn.collectAsStateWithLifecycle()
    var tray by rememberSaveable { mutableStateOf<ComposerTray?>(null) }
    val palette = LocalPalette.current
    val motion = rememberMotion()
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current

    Box(
        Modifier
            .fillMaxSize()
            .background(palette.background)
            // The page doesn't scroll, so a tap on the open space is what puts the keyboard away.
            .pointerInput(Unit) { detectTapGestures { focusManager.clearFocus() } },
    ) {
        HomeBackdrop(instance, Modifier.matchParentSize())
        Column(Modifier.fillMaxSize().imePadding()) {
            Column(Modifier.weight(1f).fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(top = 48.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                BasicText(
                    "Direct anything.",
                    style = TypeSize.Display.style(FontWeight.SemiBold).copy(color = palette.foreground, fontSize = 34.sp, lineHeight = 38.sp, letterSpacing = (-0.02).em, textAlign = TextAlign.Center),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).semantics { heading() },
                )
                BasicText(
                    "Describe a scene and watch it play out. Then edit it, restyle it, or take it live.",
                    style = TypeSize.Lead.style().copy(color = palette.mutedForeground, textAlign = TextAlign.Center),
                    modifier = Modifier.padding(top = 10.dp).padding(horizontal = 28.dp),
                )
                if (state.phase == Phase.Failed) LoadFailure("The starting points didn't load. Check your connection and try again.") { model.load() }
            }

            // Starting points are for a blank page: once there are words they step aside for them.
            AnimatedVisibility(state.draft.prompt.isEmpty() && state.starters.isNotEmpty(), enter = fadeIn(motion.morph()), exit = fadeOut(motion.exit())) {
                LazyRow(Modifier.padding(bottom = 10.dp), contentPadding = PaddingValues(horizontal = ComposerInset), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(state.starters, key = { it.id }) { starter ->
                        // A starting point is sent as it is, and the agent asks for the rest in the conversation it opens.
                        Chip(starter.label, STARTER_ICONS[starter.id] ?: Icons.Rounded.Movie, enabled = !state.sending, hint = "Start a conversation") {
                            scope.launch { if (account.requireSignIn("Sign in to start a conversation.")) model.start(starter, onOpen) }
                        }
                    }
                }
            }

            AnimatedVisibility(state.sendError != null, Modifier.align(Alignment.CenterHorizontally)) {
                BasicText(state.sendError.orEmpty(), style = TypeSize.Caption.style().copy(color = palette.destructive), modifier = Modifier.padding(bottom = 8.dp))
            }

            Composer(state.draft, model::setDraft, onSend = {
                // A guest signs in here and carries on: the request is still in the composer.
                scope.launch { if (account.requireSignIn("Sign in to send this. What you wrote stays here.")) model.send(onOpen) }
            }, choices = ComposerChoices(
                models,
                casting = instance?.content?.characters == true,
                // Attaching and casting need an account, so a guest signs in first and then the tray opens.
                attach = { scope.launch { if (account.requireSignIn("Sign in to attach from your library.")) tray = ComposerTray.Attach } },
                castCharacter = { scope.launch { if (account.requireSignIn("Sign in to put a character in it.")) tray = ComposerTray.Cast } },
            ), modifier = composerModifier.padding(horizontal = ComposerInset).padding(bottom = 8.dp), sending = state.sending, focus = focus)
        }
        Row(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            if (signedIn) {
                Box(Modifier.size(48.dp).pressable(round = true, label = "Your conversations", onClick = openHistory).semantics { contentDescription = "Your conversations" }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Rounded.History, contentDescription = null, tint = palette.foreground, modifier = Modifier.glass(CircleShape).padding(7.dp).size(20.dp))
                }
            }
            Spacer(Modifier.weight(1f))
            accountButton()
        }
    }

    when (tray) {
        ComposerTray.Attach -> Tray("Attach from your library", onDismiss = { tray = null }) { AttachTray(support, state.draft, model::setDraft) }
        ComposerTray.Cast -> Tray("Put a character in it", onDismiss = { tray = null }) { close -> CastTray(support, state.draft, model::setDraft, close) }
        null -> {}
    }
}

/** The instance's own picture behind the whole page, quieter towards the foot where the composer's words are read over it. */
@Composable
private fun HomeBackdrop(instance: InstanceDescription?, modifier: Modifier) {
    val palette = LocalPalette.current
    val dark = LocalDarkTheme.current
    val home = instance?.home
    val picture = home?.backgroundPoster ?: home?.backgroundImage
    val sky = home?.backgroundImage?.takeIf { home.aurora }
    Box(modifier) {
        if (sky != null) {
            AuroraSky(sky, dark, Modifier.fillMaxSize())
            // The drawn aurora paints its own pale sky on the light theme, so it needs only a light veil.
            Box(Modifier.fillMaxSize().background(palette.panel.copy(alpha = if (dark) 0.22f else 0.15f)))
        } else if (picture != null) {
            AsyncImage(model = picture, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            // A light scrim on the dark theme, a heavier one on the light, as on the web.
            Box(Modifier.fillMaxSize().background(palette.panel.copy(alpha = if (dark) 0.22f else 0.66f)))
        }
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.6f to Color.Transparent, 1f to palette.background.copy(alpha = 0.55f))))
    }
}

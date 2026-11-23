package org.livepeer.app.composer

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Upload
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.livepeer.app.api.ApiError
import org.livepeer.app.api.ApiTransport
import org.livepeer.app.design.LoadFailure
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.MediaStill
import org.livepeer.app.design.SecondaryButton
import org.livepeer.app.design.breathing
import org.livepeer.app.design.pressable
import org.livepeer.app.design.style
import org.livepeer.app.generated.AgentModelEntry
import org.livepeer.app.generated.Api
import org.livepeer.app.generated.Character
import org.livepeer.app.generated.CharacterCast
import org.livepeer.app.generated.MediaItem
import org.livepeer.app.generated.MediaKind
import org.livepeer.app.generated.Radius
import org.livepeer.app.generated.TypeSize
import org.livepeer.app.home.Draft
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Something read on demand: not yet, under way, read, or failed. */
sealed interface Load<out T> {
    data object Idle : Load<Nothing>
    data object Loading : Load<Nothing>
    data object Failed : Load<Nothing>
    data class Loaded<T>(val value: T) : Load<T>
}

/**
 * What every composer can offer besides words: the agent's models, the capabilities on offer, and the
 * library and characters to pick from. Read once and shared by Home and every conversation.
 */
class ComposerSupport(private val api: Api, private val transport: ApiTransport) {
    private val _models = MutableStateFlow<List<AgentModelEntry>>(emptyList())
    private val _library = MutableStateFlow<Load<List<MediaItem>>>(Load.Idle)
    private val _characters = MutableStateFlow<Load<List<Character>>>(Load.Idle)
    /** The capabilities on offer, so casting a character can start the shot from their portrait. */
    private var apps: Set<String> = emptySet()

    val models: StateFlow<List<AgentModelEntry>> = _models
    val library: StateFlow<Load<List<MediaItem>>> = _library
    val characters: StateFlow<Load<List<Character>>> = _characters
    private val _uploading = MutableStateFlow(false)
    private val _uploadError = MutableStateFlow<String?>(null)
    /** Whether a file from the phone is on its way to the library. */
    val uploading: StateFlow<Boolean> = _uploading
    /** Why the last file didn't arrive, in words for the user. */
    val uploadError: StateFlow<String?> = _uploadError
    /** A character waiting to be put in Home's composer, from "Cast in a scene" on their page. */
    val pendingCast = MutableStateFlow<Character?>(null)

    suspend fun load() {
        runCatching { api.listAgentModelMenu() }.onSuccess { _models.value = it }
        runCatching { api.listCapabilityLabels() }.onSuccess { labels -> apps = labels.map { it.app }.toSet() }
    }

    /** The person's videos and pictures: something for the agent to watch, or to start a shot from. */
    suspend fun loadLibrary() = read(_library) { api.searchLibrary().filter { it.kind == MediaKind.Video || it.kind == MediaKind.Image } }

    /**
     * Sends a photo or video picked on the phone to the library and answers with the item. Null when it
     * didn't arrive; [uploadError] then says why.
     */
    suspend fun upload(context: Context, picked: Uri): MediaItem? {
        if (_uploading.value) return null
        _uploading.value = true
        _uploadError.value = null
        var file: PickedFile? = null
        try {
            file = withContext(Dispatchers.IO) { PickedFile.read(context.applicationContext, picked) }
            if (file == null) {
                _uploadError.value = "That couldn't be read from your photos. Choose it again."
                return null
            }
            val ticket = api.requestUpload(kind = file.kind, name = file.name, contentType = file.contentType, sizeBytes = file.file.length().toDouble(), aspect = file.aspect)
            val item = transport.put(MediaItem.serializer(), file.file, file.contentType, ticket.path)
            (_library.value as? Load.Loaded)?.let { _library.value = Load.Loaded(listOf(item) + it.value) }
            return item
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            _uploadError.value = if (error is ApiError && (error.status == 413 || error.status == 415)) error.message else "That didn't upload. Check your connection and try again."
            return null
        } finally {
            file?.file?.delete()
            _uploading.value = false
        }
    }

    fun clearUploadError() { _uploadError.value = null }

    /** Characters the person can put on screen: their own first, then the public ones. */
    suspend fun loadCharacters() = read(_characters) { api.listCharacters().sortedByDescending { it.mine } }

    /** Forgets what belonged to the person who was signed in. */
    fun signedOut() {
        _uploadError.value = null
        _library.value = Load.Idle
        _characters.value = Load.Idle
    }

    /** Puts a character on screen. The shot starts from their portrait, so it becomes image to video when the network offers it. */
    fun cast(character: Character, draft: Draft): Draft =
        draft.copy(cast = CharacterCast(character.slug, character.name, character.image), app = if ("image-to-video" in apps) "image-to-video" else draft.app)

    private suspend fun <T> read(into: MutableStateFlow<Load<T>>, fetch: suspend () -> T) {
        if (into.value !is Load.Loaded) into.value = Load.Loading
        try {
            into.value = Load.Loaded(fetch())
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            if (into.value !is Load.Loaded) into.value = Load.Failed
        }
    }
}

/** Which composer tray is open. */
enum class ComposerTray { Attach, Cast }

/**
 * A photo or video to attach: one from the phone, which goes to the library first, or one already there.
 * Each tap on a library item adds or removes it; the tray stays open to pick several.
 */
@Composable
fun AttachTray(support: ComposerSupport, draft: Draft, onDraft: (Draft) -> Unit, done: () -> Unit) {
    val palette = LocalPalette.current
    val library by support.library.collectAsStateWithLifecycle()
    val uploading by support.uploading.collectAsStateWithLifecycle()
    val uploadError by support.uploadError.collectAsStateWithLifecycle()
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    // The upload finishes after the picker has come and gone; it adds to the draft as it is then.
    val latest by rememberUpdatedState(draft)
    // The system's own picker: it runs outside the app, so no access to the photo library is asked for.
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { picked ->
        if (picked != null) scope.launch {
            val item = support.upload(context, picked) ?: return@launch
            onDraft(latest.copy(attachments = latest.attachments + item))
            done()
        }
    }
    LaunchedEffect(Unit) { support.loadLibrary() }
    DisposableEffect(Unit) { onDispose { support.clearUploadError() } }

    BasicText("The agent can watch a video and work from it, or start a shot from a picture.", style = TypeSize.Body.style().copy(color = palette.mutedForeground))
    SecondaryButton(if (uploading) "Uploading…" else "Upload from your photos", icon = Icons.Rounded.Upload, enabled = !uploading, busy = uploading) {
        picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
    }
    uploadError?.let { BasicText(it, style = TypeSize.Caption.style().copy(color = palette.destructive)) }
    BasicText("From your library", style = TypeSize.Caption.style(FontWeight.Medium).copy(color = palette.mutedForeground), modifier = Modifier.padding(top = 4.dp))
    when (val current = library) {
        Load.Idle, Load.Loading -> Skeleton(16f / 9f)
        Load.Failed -> LoadFailure("Your library didn't load.") { scope.launch { support.loadLibrary() } }
        is Load.Loaded -> if (current.value.isEmpty()) {
            BasicText("Nothing in your library yet. Shots you generate and files you upload are saved there.", style = TypeSize.Body.style().copy(color = palette.mutedForeground))
        } else {
            Grid(current.value, columns = 3) { item ->
                val attached = draft.attachments.any { it.id == item.id }
                val shape = RoundedCornerShape(Radius.Field.dp)
                Box(
                    Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(shape).border(if (attached) 2.dp else 1.dp, if (attached) palette.foreground else palette.hairline, shape)
                        .pressable {
                            haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                            onDraft(draft.copy(attachments = if (attached) draft.attachments.filterNot { it.id == item.id } else draft.attachments + item))
                        }
                        .semantics { contentDescription = item.title; selected = attached },
                ) {
                    MediaStill(item.image, item.artwork, Modifier.fillMaxSize())
                    if (attached) {
                        Box(Modifier.align(Alignment.TopEnd).padding(5.dp).size(20.dp).background(palette.primary, CircleShape), contentAlignment = Alignment.Center) {
                            Icon(Icons.Rounded.Check, contentDescription = null, tint = palette.primaryForeground, modifier = Modifier.size(12.dp))
                        }
                    }
                }
            }
        }
    }
}

/** Characters to put on screen. Picking one closes the tray. */
@Composable
fun CastTray(support: ComposerSupport, draft: Draft, onDraft: (Draft) -> Unit, done: () -> Unit) {
    val palette = LocalPalette.current
    val characters by support.characters.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { support.loadCharacters() }

    BasicText("Their portrait becomes the first frame, so they look like themselves in every shot.", style = TypeSize.Body.style().copy(color = palette.mutedForeground))
    when (val current = characters) {
        Load.Idle, Load.Loading -> Skeleton(3f / 4f)
        Load.Failed -> LoadFailure("Characters didn't load.") { scope.launch { support.loadCharacters() } }
        is Load.Loaded -> if (current.value.isEmpty()) {
            BasicText("No characters yet. Make one on the web and it shows up here.", style = TypeSize.Body.style().copy(color = palette.mutedForeground))
        } else {
            Grid(current.value, columns = 3) { character ->
                val chosen = draft.cast?.slug == character.slug
                val shape = RoundedCornerShape(Radius.Field.dp)
                Column(
                    Modifier.pressable { onDraft(support.cast(character, draft)); done() }.semantics(mergeDescendants = true) { contentDescription = "${character.name}, ${character.tagline}" },
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    MediaStill(character.image, character.artwork, Modifier.fillMaxWidth().aspectRatio(3f / 4f).clip(shape).border(if (chosen) 2.dp else 1.dp, if (chosen) palette.foreground else palette.hairline, shape))
                    BasicText(character.name, style = TypeSize.Caption.style(FontWeight.Medium).copy(color = palette.foreground), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

/** A grid inside a tray, which already scrolls: rows of [columns] cells. */
@Composable
private fun <T> Grid(items: List<T>, columns: Int, cell: @Composable (T) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (row in items.chunked(columns)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (item in row) Box(Modifier.weight(1f)) { cell(item) }
                repeat(columns - row.size) { Box(Modifier.weight(1f)) }
            }
        }
    }
}

/** A picker grid's shape while it loads. */
@Composable
private fun Skeleton(aspect: Float) {
    val palette = LocalPalette.current
    Grid(List(6) { it }, columns = 3) { Box(Modifier.fillMaxWidth().aspectRatio(aspect).background(palette.card, RoundedCornerShape(Radius.Field.dp)).breathing()) }
}

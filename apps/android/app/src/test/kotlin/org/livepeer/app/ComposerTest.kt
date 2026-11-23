package org.livepeer.app

import org.livepeer.app.api.ApiTransport
import org.livepeer.app.generated.AgentModelEntry
import org.livepeer.app.generated.Character
import org.livepeer.app.generated.CharacterCast
import org.livepeer.app.generated.ConversationSummary
import org.livepeer.app.composer.PickedFile
import org.livepeer.app.generated.MediaItem
import org.livepeer.app.generated.MediaKind
import org.livepeer.app.generated.UploadTicket
import org.livepeer.app.home.Draft
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.builtins.ListSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate
import java.util.Locale

/** What the composer sends, and the responses its menus and trays read. */
class ComposerTest {
    private fun <T> fixture(name: String, serializer: DeserializationStrategy<T>): T =
        ApiTransport.json.decodeFromString(serializer, File("../../../docs/mobile/fixtures/$name.json").readText())

    @Test
    fun anAttachmentAloneAsksForASummary() {
        val video = fixture("search_library", ListSerializer(MediaItem.serializer())).first()
        assertFalse(Draft().canSend)
        val attached = Draft(attachments = listOf(video))
        assertTrue(attached.canSend)
        assertEquals("Summarise this and list the key moments.", attached.text)
        assertEquals("Make it slower", attached.copy(prompt = "  Make it slower ").text)
    }

    @Test
    fun aPictureAloneAsksToBeBroughtToLife() {
        val picture = fixture("search_library", ListSerializer(MediaItem.serializer())).first().copy(kind = MediaKind.Image)
        assertEquals("Bring this picture to life.", Draft(attachments = listOf(picture)).text)
    }

    @Test
    fun aPickedPhotoGetsTheNearestShapeAndAName() {
        assertEquals("16:9", PickedFile.shape(4032, 3024))
        assertEquals("9:16", PickedFile.shape(3024, 4032))
        assertEquals("1:1", PickedFile.shape(1080, 1080))
        assertNull(PickedFile.shape(0, 10))
        assertEquals("Photo, 23 Nov", PickedFile.name("image", LocalDate.of(2026, 11, 23), Locale.UK))
        assertEquals("Video, 23 Nov", PickedFile.name("video", LocalDate.of(2026, 11, 23), Locale.UK))
        assertTrue(fixture("request_upload", UploadTicket.serializer()).path.startsWith("/api/v1/uploads/"))
    }

    @Test
    fun theModelAndTheCastCarryOn() {
        val cast = CharacterCast("mara", "Mara", null)
        val carried = Draft(prompt = "On a rooftop", app = "image-to-video", cast = cast, model = "northlight/chat/gemma-3-27b").carriedOn
        assertEquals("", carried.prompt)
        assertEquals(cast, carried.cast)
        assertEquals("northlight/chat/gemma-3-27b", carried.model)
        assertEquals("image-to-video", carried.app)
        assertNull(Draft(app = "text-to-video").carriedOn.app)
    }

    @Test
    fun menusAndTraysDecode() {
        val menu = fixture("list_agent_model_menu", ListSerializer(AgentModelEntry.serializer()))
        assertTrue(menu.size >= 2 && menu.all { it.name.isNotEmpty() && it.description.isNotEmpty() })
        assertTrue(fixture("list_characters", ListSerializer(Character.serializer())).isNotEmpty())
        assertTrue(fixture("list_conversations", ListSerializer(ConversationSummary.serializer())).isNotEmpty())
        assertTrue(fixture("search_library", ListSerializer(MediaItem.serializer())).all { it.kind.value == "video" })
    }
}

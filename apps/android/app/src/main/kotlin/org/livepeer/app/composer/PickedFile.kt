package org.livepeer.app.composer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.ExifInterface
import android.net.Uri
import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * A photo or video picked on the phone, copied to a file ready to send. A picture in a format every client
 * can show goes as it is; any other is rewritten as a JPEG. A video goes as the phone recorded it.
 */
class PickedFile(val file: File, val kind: String, val name: String, val contentType: String, val aspect: String?) {
    companion object {
        private val SENDABLE_PICTURES = setOf("image/jpeg", "image/png", "image/webp")
        /** The longest side a rewritten picture keeps, so decoding a large photo can't run out of memory. */
        private const val LONGEST_SIDE = 4096

        /** The nearest of the three shapes to a picture, so its tile isn't cropped more than it has to be. */
        fun shape(width: Int, height: Int): String? {
            if (width <= 0 || height <= 0) return null
            val ratio = width.toFloat() / height
            return if (ratio > 1.3f) "16:9" else if (ratio < 0.77f) "9:16" else "1:1"
        }

        /** A name for something from the photo picker, whose own names are numbers: "Photo, 23 Nov". */
        fun name(kind: String, date: LocalDate = LocalDate.now(), locale: Locale = Locale.getDefault()): String =
            "${if (kind == "video") "Video" else "Photo"}, ${date.format(DateTimeFormatter.ofPattern("d MMM", locale))}"

        /** Reads what was picked into the app's cache. Null when it can't be read. Call off the main thread. */
        fun read(context: Context, uri: Uri): PickedFile? {
            val resolver = context.contentResolver
            val type = resolver.getType(uri)?.lowercase() ?: return null
            val copy = File.createTempFile("upload-", null, context.cacheDir)
            try {
                if (type.startsWith("video/")) {
                    resolver.openInputStream(uri)?.use { input -> copy.outputStream().use { input.copyTo(it) } } ?: return discard(copy)
                    return PickedFile(copy, "video", name("video"), type, null)
                }
                if (!type.startsWith("image/")) return discard(copy)

                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                // Reading only the size answers with no bitmap, so nothing is to be made of what it returns.
                (resolver.openInputStream(uri) ?: return discard(copy)).use { BitmapFactory.decodeStream(it, null, bounds) }
                // A phone stores a portrait photo on its side and says so; the shape follows how it is seen.
                val turned = resolver.openInputStream(uri)?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
                    .let { it == ExifInterface.ORIENTATION_ROTATE_90 || it == ExifInterface.ORIENTATION_ROTATE_270 || it == ExifInterface.ORIENTATION_TRANSPOSE || it == ExifInterface.ORIENTATION_TRANSVERSE }
                val aspect = if (turned) shape(bounds.outHeight, bounds.outWidth) else shape(bounds.outWidth, bounds.outHeight)

                if (type in SENDABLE_PICTURES) {
                    resolver.openInputStream(uri)?.use { input -> copy.outputStream().use { input.copyTo(it) } } ?: return discard(copy)
                    return PickedFile(copy, "image", name("image"), type, aspect)
                }
                var sample = 1
                while (maxOf(bounds.outWidth, bounds.outHeight) / sample > LONGEST_SIDE) sample *= 2
                val bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return discard(copy)
                copy.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
                bitmap.recycle()
                return PickedFile(copy, "image", name("image"), "image/jpeg", aspect)
            } catch (error: Exception) {
                return discard(copy)
            }
        }

        private fun discard(file: File): PickedFile? {
            file.delete()
            return null
        }
    }
}

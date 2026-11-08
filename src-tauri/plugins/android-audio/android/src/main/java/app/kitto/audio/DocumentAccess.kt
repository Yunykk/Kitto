package app.kitto.audio

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import app.tauri.plugin.JSObject
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest

/** Only document URIs explicitly granted by the Android document picker are accepted. */
internal object DocumentAccess {
    private fun key(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }

    fun cachedMetadata(context: Context, value: String): JSONObject? = runCatching {
        context.getSharedPreferences("kitto.audio.metadata.v1", Context.MODE_PRIVATE)
            .getString(key(value), null)?.let { JSONObject(it) }
    }.getOrNull()

    fun requireGranted(context: Context, value: String): Uri {
        val uri = Uri.parse(value)
        require(uri.scheme == "content" && !uri.authority.isNullOrBlank()) {
            "Select this file again with Add music. Android playback needs a document URI."
        }
        require(context.contentResolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission }) {
            "Access to this document has expired. Select it again with Add music."
        }
        return uri
    }

    fun describe(context: Context, uri: Uri): JSObject {
        var name = uri.lastPathSegment?.substringAfterLast('/') ?: "Audio document"
        var size: Long? = null
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (nameColumn >= 0 && !cursor.isNull(nameColumn)) name = cursor.getString(nameColumn)
                val sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) size = cursor.getLong(sizeColumn)
            }
        }
        val mime = context.contentResolver.getType(uri)
        val extension = name.substringAfterLast('.', "").lowercase()
        require(mime?.startsWith("audio/") == true || mime == "application/ogg" || extension in setOf("mp3", "flac", "wav", "ogg", "opus", "m4a", "aac", "aiff", "aif", "alac", "ape", "wma", "mp4", "webm")) {
            "$name is not a supported audio document."
        }
        return JSObject().apply {
            put("uri", uri.toString())
            put("name", name.take(1024))
            put("mimeType", mime ?: JSONObject.NULL)
            put("size", size ?: JSONObject.NULL)
        }
    }

    fun metadata(context: Context, value: String, includeCover: Boolean): JSObject {
        val uri = requireGranted(context, value)
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(context, uri)
            val result = JSObject()
            for ((key, field) in listOf("title" to MediaMetadataRetriever.METADATA_KEY_TITLE, "artist" to MediaMetadataRetriever.METADATA_KEY_ARTIST, "album" to MediaMetadataRetriever.METADATA_KEY_ALBUM, "albumArtist" to MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST)) {
                val text = retriever.extractMetadata(field)?.trim()?.take(512)?.takeIf { it.isNotEmpty() }
                result.put(key, text ?: JSONObject.NULL)
            }
            fun number(field: Int): Int? = retriever.extractMetadata(field)?.substringBefore('/')?.trim()?.toIntOrNull()?.takeIf { it > 0 }
            result.put("trackNumber", number(MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER) ?: JSONObject.NULL)
            result.put("discNumber", number(MediaMetadataRetriever.METADATA_KEY_DISC_NUMBER) ?: JSONObject.NULL)
            result.put("coverBase64", JSONObject.NULL)
            result.put("coverMime", JSONObject.NULL)
            val cache = JSONObject()
            for (name in listOf("title", "artist", "album", "albumArtist", "trackNumber", "discNumber")) cache.put(name, result.opt(name))
            cachedMetadata(context, value)?.let { previous ->
                previous.optString("artworkUri").takeIf { it.isNotEmpty() }?.let { cache.put("artworkUri", it) }
                if (previous.optBoolean("artworkChecked", false)) cache.put("artworkChecked", true)
            }
            if (includeCover) {
                cache.put("artworkChecked", true)
                val picture = retriever.embeddedPicture
                if (picture != null && picture.size <= 8 * 1024 * 1024) {
                    thumbnail(picture)?.let { bytes ->
                        result.put("coverBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
                        result.put("coverMime", "image/png")
                        val directory = File(context.cacheDir, "kitto-artwork").apply { mkdirs() }
                        val file = File(directory, "${key(value)}.png")
                        runCatching { file.writeBytes(bytes); cache.put("artworkUri", Uri.fromFile(file).toString()) }
                    }
                }
            }
            context.getSharedPreferences("kitto.audio.metadata.v1", Context.MODE_PRIVATE)
                .edit().putString(key(value), cache.toString()).apply()
            return result
        } finally { retriever.release() }
    }

    fun thumbnail(bytes: ByteArray): ByteArray? {
        val dimensions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, dimensions)
        if (dimensions.outWidth <= 0 || dimensions.outHeight <= 0) return null
        var sample = 1
        while (dimensions.outWidth / sample > 512 || dimensions.outHeight / sample > 512) sample *= 2
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        return try {
            ByteArrayOutputStream().use { output ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
                output.toByteArray().takeIf { it.size <= 1024 * 1024 }
            }
        } finally { bitmap.recycle() }
    }
}

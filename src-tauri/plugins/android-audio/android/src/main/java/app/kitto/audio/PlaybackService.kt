package app.kitto.audio

import android.app.PendingIntent
import android.content.Intent
import android.media.audiofx.Equalizer
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import app.tauri.plugin.JSObject
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.pow
import java.util.UUID
import java.util.concurrent.Executors

/** The native playlist and player remain alive when the WebView is suspended. */
@androidx.media3.common.util.UnstableApi
class PlaybackService : MediaSessionService() {
    companion object { @Volatile var instance: PlaybackService? = null; private set }
    private lateinit var player: ExoPlayer
    private var session: MediaSession? = null
    private val main = Handler(Looper.getMainLooper())
    private val metadataWorker = Executors.newSingleThreadExecutor()
    private val metadataPending = mutableSetOf<String>()
    private var revision = 0L
    private val serviceId = UUID.randomUUID().toString()
    private var lastError: String? = null
    private var restoring = true
    private var queue = JSONArray()
    private var equalizer: Equalizer? = null
    private var eqSettings = JSONObject()
    private var volume = 1f
    private var tuningFrequency: Int? = null
    private val preferences by lazy { getSharedPreferences("kitto.native.audio.v1", MODE_PRIVATE) }
    private val persistTick = object : Runnable {
        override fun run() {
            persist()
            main.postDelayed(this, 5000)
        }
    }

    override fun onCreate() {
        super.onCreate()
        player = ExoPlayer.Builder(this).build().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            setHandleAudioBecomingNoisy(true)
            setWakeMode(C.WAKE_MODE_LOCAL)
        }
        player.addListener(object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) {
                if (events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION) || events.contains(Player.EVENT_IS_PLAYING_CHANGED) || events.contains(Player.EVENT_PLAYBACK_STATE_CHANGED) || events.contains(Player.EVENT_POSITION_DISCONTINUITY) || events.contains(Player.EVENT_REPEAT_MODE_CHANGED) || events.contains(Player.EVENT_SHUFFLE_MODE_ENABLED_CHANGED)) {
                    revision++
                    persist()
                }
                if (events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION)) loadCurrentMetadata()
            }
            override fun onPlayerError(error: PlaybackException) {
                lastError = "Could not play this document: ${error.errorCodeName}. Check the file and its access permission."
                revision++
                persist()
            }
        })
        player.addAnalyticsListener(object : AnalyticsListener {
            override fun onAudioSessionIdChanged(eventTime: AnalyticsListener.EventTime, audioSessionId: Int) {
                equalizer?.release()
                equalizer = null
                if (audioSessionId != C.AUDIO_SESSION_ID_UNSET) {
                    equalizer = runCatching { Equalizer(0, audioSessionId) }.getOrNull()
                    applyEqualizer()
                }
            }
        })
        val builder = MediaSession.Builder(this, player).setCallback(object : MediaSession.Callback {
            override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
                if (controller.packageName == packageName) return super.onConnect(session, controller)
                // Lock-screen/headset controllers may operate the queue, but cannot inject URIs.
                val commands = Player.Commands.Builder().addAllCommands()
                    .remove(Player.COMMAND_CHANGE_MEDIA_ITEMS).remove(Player.COMMAND_SET_MEDIA_ITEM)
                    .remove(Player.COMMAND_SET_SPEED_AND_PITCH).build()
                return MediaSession.ConnectionResult.AcceptedResultBuilder(session).setAvailablePlayerCommands(commands).build()
            }
        })
        packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
            builder.setSessionActivity(PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        }
        session = builder.build()
        restore()
        restoring = false
        instance = this
        main.postDelayed(persistTick, 5000)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? =
        if (controllerInfo.packageName == packageName || controllerInfo.isTrusted) session else null

    private fun grantedTrack(track: JSONObject): MediaItem {
        val path = track.getString("path")
        val uri = DocumentAccess.requireGranted(this, path)
        val metadata = trackMetadata(track)
        return MediaItem.Builder().setMediaId(track.optString("id", path)).setUri(uri).setMediaMetadata(metadata.build()).build()
    }

    private fun trackMetadata(track: JSONObject): MediaMetadata.Builder {
        val cached = DocumentAccess.cachedMetadata(this, track.getString("path"))
        fun text(name: String): String? = (cached?.optString(name)?.takeIf { it.isNotBlank() && it != "null" }
            ?: track.optString(name).takeIf { it.isNotBlank() && it != "null" })?.take(512)
        val metadata = MediaMetadata.Builder().setTitle(text("title") ?: "Audio document")
            .setArtist(text("artist")).setAlbumTitle(text("album"))
        cached?.optString("artworkUri")?.takeIf { it.startsWith("file:") }?.let { metadata.setArtworkUri(android.net.Uri.parse(it)) }
        return metadata
    }

    fun refreshMetadata(uri: String) {
        for (index in 0 until queue.length()) {
            val track = queue.getJSONObject(index)
            if (track.optString("path") == uri && index < player.mediaItemCount) {
                player.replaceMediaItem(index, player.getMediaItemAt(index).buildUpon().setMediaMetadata(trackMetadata(track).build()).build())
            }
        }
    }

    private fun loadCurrentMetadata() {
        val index = player.currentMediaItemIndex
        val uri = queue.optJSONObject(index)?.optString("path") ?: return
        if (DocumentAccess.cachedMetadata(this, uri)?.has("artworkChecked") == true || !metadataPending.add(uri)) return
        metadataWorker.execute {
            runCatching { DocumentAccess.metadata(this, uri, true) }
            main.post {
                metadataPending.remove(uri)
                if (instance === this) refreshMetadata(uri)
            }
        }
    }

    fun request(command: String, payload: JSONObject): JSObject {
        when (command) {
            "setQueue" -> setQueue(payload)
            "play" -> {
                require(player.mediaItemCount > 0) { "Add music before starting playback." }
                lastError = null
                if (player.playbackState == Player.STATE_IDLE) player.prepare()
                if (player.playbackState == Player.STATE_ENDED) player.seekToDefaultPosition()
                player.play()
            }
            "pause" -> player.pause()
            "seek" -> player.seekTo((finite(payload.optDouble("position", 0.0)).coerceAtLeast(0.0) * 1000).toLong())
            "next" -> if (player.hasNextMediaItem()) player.seekToNextMediaItem()
            "previous" -> player.seekToPrevious()
            "volume" -> { volume = finite(payload.optDouble("volume", 1.0)).coerceIn(0.0, 1.0).toFloat(); applyEqualizer() }
            "options" -> {
                player.shuffleModeEnabled = payload.optBoolean("shuffle", false)
                player.repeatMode = when (payload.optString("repeatMode", "off")) { "one" -> Player.REPEAT_MODE_ONE; "all" -> Player.REPEAT_MODE_ALL; else -> Player.REPEAT_MODE_OFF }
            }
            "equalizer" -> { eqSettings = JSONObject(payload.toString()); applyEqualizer() }
            "tuning" -> {
                tuningFrequency = if (payload.isNull("frequency")) null else {
                    val frequency = payload.getInt("frequency")
                    require(frequency in setOf(396, 432, 528, 639, 741, 852)) { "Unsupported tuning frequency." }
                    frequency
                }
                applyTuning()
            }
            "stop" -> { player.pause(); player.clearMediaItems(); queue = JSONArray(); lastError = null }
            "snapshot" -> Unit
            else -> error("Unsupported player command.")
        }
        if (command != "snapshot") { revision++; persist() }
        return snapshot()
    }

    private fun setQueue(payload: JSONObject) {
        val next = payload.optJSONArray("tracks") ?: JSONArray()
        require(next.length() <= 10000) { "The playback queue is too large." }
        // Validate before changing live playback; revoked or invalid access never corrupts it.
        val items = (0 until next.length()).map { grantedTrack(next.getJSONObject(it)) }
        if (items.isEmpty()) { player.pause(); player.clearMediaItems(); queue = JSONArray(); lastError = null; return }
        require(items.map { it.mediaId }.toSet().size == items.size) { "Playback queue entries must have unique IDs." }
        val currentId = player.currentMediaItem?.mediaId
        val currentUri = player.currentMediaItem?.localConfiguration?.uri
        val preserve = payload.optBoolean("preserveCurrent", false) && currentId != null && items.any { it.mediaId == currentId && it.localConfiguration?.uri == currentUri }
        val index = if (preserve) items.indexOfFirst { it.mediaId == currentId } else payload.optInt("index", 0).coerceIn(0, items.lastIndex)
        val position = if (preserve) player.currentPosition else (finite(payload.optDouble("position", 0.0)).coerceAtLeast(0.0) * 1000).toLong()
        val autoplay = if (preserve) player.playWhenReady else payload.optBoolean("autoplay", false)
        queue = JSONArray(next.toString())
        lastError = null
        if (preserve) {
            // Move/add/remove around the live item. Media3 retains its position and decoder.
            for ((cursor, desired) in items.withIndex()) {
                val match = (cursor until player.mediaItemCount).firstOrNull { location ->
                    val existing = player.getMediaItemAt(location)
                    existing.mediaId == desired.mediaId && existing.localConfiguration?.uri == desired.localConfiguration?.uri
                }
                if (match == null) player.addMediaItem(cursor, desired)
                else {
                    if (match != cursor) player.moveMediaItem(match, cursor)
                    if (player.getMediaItemAt(cursor).mediaMetadata != desired.mediaMetadata) player.replaceMediaItem(cursor, desired)
                }
            }
            if (player.mediaItemCount > items.size) player.removeMediaItems(items.size, player.mediaItemCount)
            return
        }
        player.setMediaItems(items, index, position)
        player.prepare()
        player.playWhenReady = autoplay
    }

    private fun snapshot(): JSObject {
        val index = if (player.mediaItemCount == 0) -1 else player.currentMediaItemIndex
        val path = if (index >= 0 && index < queue.length()) queue.getJSONObject(index).optString("path") else null
        return JSObject().apply {
            put("path", path ?: JSONObject.NULL)
            put("index", index)
            put("position", max(0L, player.currentPosition) / 1000.0)
            put("duration", if (player.duration > 0) player.duration / 1000.0 else 0.0)
            put("playing", player.mediaItemCount > 0 && player.playWhenReady && player.playbackState != Player.STATE_ENDED && lastError == null && player.playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_NONE)
            put("buffering", player.playbackState == Player.STATE_BUFFERING)
            put("ended", player.playbackState == Player.STATE_ENDED)
            put("error", lastError ?: JSONObject.NULL)
            put("revision", revision)
            put("serviceId", serviceId)
            put("canNext", player.hasNextMediaItem())
            put("canPrevious", player.hasPreviousMediaItem() || player.currentPosition > 3000)
            put("shuffle", player.shuffleModeEnabled)
            put("repeatMode", when (player.repeatMode) { Player.REPEAT_MODE_ONE -> "one"; Player.REPEAT_MODE_ALL -> "all"; else -> "off" })
            put("equalizerAvailable", equalizer != null)
            put("tuningFrequency", tuningFrequency ?: JSONObject.NULL)
        }
    }

    private fun applyEqualizer() {
        val enabled = eqSettings.optBoolean("enabled", false)
        val gains = eqSettings.optJSONArray("gains") ?: JSONArray()
        val frequencies = doubleArrayOf(31.25, 62.5, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0)
        val normalized = frequencies.indices.map { finite(gains.optDouble(it, 0.0)).coerceIn(-12.0, 12.0) }
        var preamp = finite(eqSettings.optDouble("preamp", 0.0)).coerceIn(-24.0, 0.0)
        if (eqSettings.optBoolean("autoPreamp", true)) preamp = minOf(preamp, -max(0.0, normalized.maxOrNull() ?: 0.0))
        player.volume = (volume * if (enabled) 10.0.pow(preamp / 20).toFloat() else 1f).coerceIn(0f, 1f)
        equalizer?.let { effect ->
            runCatching {
                effect.enabled = enabled
                if (enabled) {
                    val limits = effect.bandLevelRange
                    for (band in 0 until effect.numberOfBands.toInt()) {
                        val hz = effect.getCenterFreq(band.toShort()) / 1000.0
                        val nearest = frequencies.indices.minByOrNull { abs(ln(max(1.0, hz) / frequencies[it])) } ?: 0
                        val level = (normalized[nearest] * 100).toInt().coerceIn(limits[0].toInt(), limits[1].toInt())
                        effect.setBandLevel(band.toShort(), level.toShort())
                    }
                }
            }.onFailure {
                runCatching { effect.release() }
                if (equalizer === effect) equalizer = null
            }
        }
    }

    private fun applyTuning() {
        player.playbackParameters = PlaybackParameters(1f, (tuningFrequency ?: 440) / 440f)
    }

    private fun persist() {
        if (restoring || !::player.isInitialized) return
        val state = JSONObject().apply {
            put("tracks", queue)
            put("index", if (player.mediaItemCount > 0) player.currentMediaItemIndex else 0)
            put("position", max(0L, player.currentPosition) / 1000.0)
            put("shuffle", player.shuffleModeEnabled)
            put("repeatMode", player.repeatMode)
            put("volume", volume.toDouble())
            put("equalizer", eqSettings)
            put("tuningFrequency", tuningFrequency ?: JSONObject.NULL)
        }
        preferences.edit().putString("state", state.toString()).apply()
    }

    private fun restore() {
        runCatching {
            val state = JSONObject(preferences.getString("state", "{}") ?: "{}")
            val saved = state.optJSONArray("tracks") ?: JSONArray()
            val oldIndex = state.optInt("index", 0)
            val oldId = saved.optJSONObject(oldIndex)?.optString("id")
            val allowed = JSONArray()
            for (index in 0 until saved.length()) {
                val track = saved.getJSONObject(index)
                if (runCatching { DocumentAccess.requireGranted(this, track.getString("path")) }.isSuccess) allowed.put(track)
            }
            var index = 0
            for (cursor in 0 until allowed.length()) if (allowed.getJSONObject(cursor).optString("id") == oldId) index = cursor
            setQueue(JSONObject().put("tracks", allowed).put("index", index).put("position", state.optDouble("position", 0.0)).put("autoplay", false))
            player.shuffleModeEnabled = state.optBoolean("shuffle", false)
            player.repeatMode = state.optInt("repeatMode", Player.REPEAT_MODE_OFF).coerceIn(Player.REPEAT_MODE_OFF, Player.REPEAT_MODE_ALL)
            volume = finite(state.optDouble("volume", 1.0)).coerceIn(0.0, 1.0).toFloat()
            eqSettings = state.optJSONObject("equalizer") ?: JSONObject()
            tuningFrequency = state.optInt("tuningFrequency", 0).takeIf { it in setOf(396, 432, 528, 639, 741, 852) }
            applyTuning()
            applyEqualizer()
        }.onFailure { lastError = "Could not restore the native audio queue. Select the files again if their access changed." }
    }

    override fun onDestroy() {
        persist()
        main.removeCallbacksAndMessages(null)
        metadataWorker.shutdownNow()
        equalizer?.release()
        equalizer = null
        session?.release()
        session = null
        player.release()
        instance = null
        super.onDestroy()
    }

    private fun finite(value: Double): Double = if (value.isFinite()) value else 0.0
}

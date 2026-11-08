package app.kitto.audio

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject
import java.util.concurrent.Executors

@TauriPlugin
@androidx.media3.common.util.UnstableApi
class AndroidAudioPlugin(private val activity: Activity) : Plugin(activity) {
    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newFixedThreadPool(2)
    private var connection: ListenableFuture<MediaController>? = null
    private var picking = false
    private var safeArea: SafeAreaBridge? = null

    override fun load(webView: WebView) {
        main.post {
            safeArea?.dispose()
            safeArea = SafeAreaBridge(activity, webView)
        }
    }

    override fun onResume(activity: AppCompatActivity) {
        safeArea?.refresh(true)
        super.onResume(activity)
    }

    @Command
    fun request(invoke: Invoke) {
        // This request proves the current page is alive, including after reloads.
        main.post { safeArea?.refresh(true) }
        try {
            val args = invoke.getArgs()
            val command = args.getString("command")
            val payload = args.optJSONObject("payload") ?: JSONObject()
            when (command) {
                "pickDocuments" -> main.post { pick(invoke) }
                "metadata" -> worker.execute {
                    try {
                        val uri = payload.getString("uri")
                        val metadata = DocumentAccess.metadata(activity, uri, payload.optBoolean("includeCover", true))
                        main.post { PlaybackService.instance?.refreshMetadata(uri) }
                        invoke.resolve(metadata)
                    }
                    catch (error: Exception) { invoke.reject(error.message ?: "Could not read this audio document.") }
                }
                "background" -> main.post { activity.moveTaskToBack(true); invoke.resolve() }
                "snapshot", "setQueue", "play", "pause", "seek", "next", "previous", "volume", "options", "equalizer", "tuning", "stop" -> main.post {
                    withService(invoke) { service -> invoke.resolve(service.request(command, payload)) }
                }
                else -> invoke.reject("Unsupported Android audio command.")
            }
        } catch (error: Exception) { invoke.reject(error.message ?: "Invalid Android audio request.") }
    }

    private fun withService(invoke: Invoke, action: (PlaybackService) -> Unit) {
        try {
            val future = connection ?: MediaController.Builder(activity, SessionToken(activity, ComponentName(activity, PlaybackService::class.java)))
                .buildAsync().also { connection = it }
            future.addListener({
                try {
                    future.get()
                    val service = PlaybackService.instance ?: error("The audio service is not available.")
                    action(service)
                } catch (error: Exception) {
                    connection = null
                    invoke.reject(error.cause?.message ?: error.message ?: "Could not connect to the audio service.")
                }
            }, ContextCompat.getMainExecutor(activity))
        } catch (error: Exception) { invoke.reject(error.message ?: "Could not start the audio service.") }
    }

    private fun pick(invoke: Invoke) {
        if (picking) { invoke.reject("The audio document picker is already open."); return }
        picking = true
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "audio/*"
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            }
            startActivityForResult(invoke, intent, "documentsResult")
        } catch (error: Exception) { picking = false; invoke.reject(error.message ?: "No document picker is available.") }
    }

    @ActivityCallback
    fun documentsResult(invoke: Invoke, result: ActivityResult) {
        picking = false
        if (result.resultCode != Activity.RESULT_OK) {
            invoke.resolve(JSObject().apply { put("documents", JSArray()) })
            return
        }
        val data = result.data
        val uris = linkedSetOf<android.net.Uri>()
        data?.data?.let { uris.add(it) }
        data?.clipData?.let { clip -> for (index in 0 until clip.itemCount) uris.add(clip.getItemAt(index).uri) }
        worker.execute {
            val newGrants = mutableListOf<android.net.Uri>()
            try {
                val documents = JSArray()
                for (uri in uris) {
                    require(uri.scheme == "content") { "This provider did not return a document URI." }
                    val alreadyGranted = activity.contentResolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission }
                    val description = DocumentAccess.describe(activity, uri)
                    activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    if (!alreadyGranted) newGrants.add(uri)
                    DocumentAccess.requireGranted(activity, uri.toString())
                    documents.put(description)
                }
                invoke.resolve(JSObject().apply { put("documents", documents) })
            } catch (error: Exception) {
                for (uri in newGrants) runCatching { activity.contentResolver.releasePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
                invoke.reject(error.message ?: "Could not keep access to these documents. Choose files from another provider.")
            }
        }
    }

    override fun onDestroy(activity: AppCompatActivity) {
        safeArea?.dispose()
        safeArea = null
        connection?.let { MediaController.releaseFuture(it) }
        connection = null
        worker.shutdown()
        super.onDestroy(activity)
    }
}

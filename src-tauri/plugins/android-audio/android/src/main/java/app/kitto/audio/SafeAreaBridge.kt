package app.kitto.audio

import android.app.Activity
import android.graphics.Rect
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.max

/**
 * Publish only the portions of system UI that actually overlap this WebView.
 * Observing leaves Tauri's/native WebView inset dispatch and IME handling intact.
 */
internal class SafeAreaBridge(private val activity: Activity, private val webView: WebView) {
    private val decor = activity.window.decorView
    private var lastGeometry: String? = null
    private var disposed = false
    private val layoutListener = View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> refresh() }
    private val drawListener = ViewTreeObserver.OnPreDrawListener { refresh(); true }

    init {
        decor.addOnLayoutChangeListener(layoutListener)
        webView.addOnLayoutChangeListener(layoutListener)
        decor.viewTreeObserver.addOnPreDrawListener(drawListener)
        webView.post { refresh(true) }
    }

    fun refresh(force: Boolean = false) {
        if (disposed || !ViewCompat.isAttachedToWindow(webView) || webView.width <= 0 || webView.height <= 0) return
        val insets = ViewCompat.getRootWindowInsets(decor) ?: ViewCompat.getRootWindowInsets(webView) ?: return
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        val viewLocation = IntArray(2)
        webView.getLocationOnScreen(viewLocation)
        val view = Rect(viewLocation[0], viewLocation[1], viewLocation[0] + webView.width, viewLocation[1] + webView.height)
        val window = if (Build.VERSION.SDK_INT >= 30) {
            Rect(activity.windowManager.currentWindowMetrics.bounds)
        } else {
            val location = IntArray(2)
            decor.getLocationOnScreen(location)
            Rect(location[0], location[1], location[0] + decor.width, location[1] + decor.height)
        }
        val left = (window.left + bars.left - view.left).coerceIn(0, webView.width)
        val top = (window.top + bars.top - view.top).coerceIn(0, webView.height)
        val right = (view.right - window.right + bars.right).coerceIn(0, webView.width)
        val bottom = (view.bottom - window.bottom + bars.bottom).coerceIn(0, webView.height)
        val imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
        val imeOverlap = if (!imeVisible) 0 else if (Build.VERSION.SDK_INT >= 30) {
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            (view.bottom - window.bottom + ime.bottom).coerceIn(0, webView.height)
        } else {
            // Older adjustResize layouts can shrink the root itself. The visible frame
            // avoids subtracting that already-handled keyboard height a second time.
            val frame = Rect()
            decor.getWindowVisibleDisplayFrame(frame)
            max(0, view.bottom - frame.bottom).coerceAtMost(webView.height)
        }
        val density = webView.resources.displayMetrics.density.toDouble().takeIf { it.isFinite() && it > 0 } ?: 1.0
        val geometry = listOf(left, top, right, bottom, imeOverlap, imeVisible, density, webView.width, webView.height, webView.progress).joinToString(":")
        if (!force && geometry == lastGeometry) return
        lastGeometry = geometry
        // A request initiated by the loaded page force-refreshes this bootstrap too,
        // so navigation/reload cannot leave CSS behind in the previous document.
        webView.evaluateJavascript("""
            (() => {
              window.__kittoAndroidInsets = {left:$left,top:$top,right:$right,bottom:$bottom,ime:$imeOverlap,imeVisible:$imeVisible,density:$density};
              if (!window.__kittoApplyAndroidInsets) {
                window.__kittoApplyAndroidInsets = () => {
                  const data = window.__kittoAndroidInsets, root = document.documentElement;
                  if (!data || !root) return;
                  const ratio = window.devicePixelRatio || data.density || 1;
                  const viewport = window.visualViewport;
                  const keyboardResize = data.imeVisible && viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
                  const topOffset = viewport ? viewport.offsetTop : 0;
                  const leftOffset = viewport ? viewport.offsetLeft : 0;
                  const bottom = Math.max(0, data.bottom / ratio - keyboardResize);
                  const ime = Math.max(0, data.ime / ratio - keyboardResize);
                  const values = {
                    'top':Math.max(0,data.top / ratio - topOffset),
                    'right':Math.max(0,data.right / ratio),
                    'bottom':Math.max(bottom,ime),
                    'left':Math.max(0,data.left / ratio - leftOffset)
                  };
                  for (const [edge,value] of Object.entries(values)) root.style.setProperty('--android-safe-' + edge,value.toFixed(2) + 'px');
                  root.style.setProperty('--android-ime-bottom',ime.toFixed(2) + 'px');
                  root.style.setProperty('--android-ime-visible',data.imeVisible ? '1' : '0');
                  const height = data.imeVisible && viewport ? Math.min(window.innerHeight,viewport.height) : window.innerHeight;
                  root.style.setProperty('--android-viewport-height',Math.max(0,height).toFixed(2) + 'px');
                };
                window.addEventListener('resize',window.__kittoApplyAndroidInsets,{passive:true});
                window.visualViewport?.addEventListener('resize',window.__kittoApplyAndroidInsets,{passive:true});
                window.visualViewport?.addEventListener('scroll',window.__kittoApplyAndroidInsets,{passive:true});
                document.addEventListener('DOMContentLoaded',window.__kittoApplyAndroidInsets,{once:true});
              }
              window.__kittoApplyAndroidInsets();
            })();
        """.trimIndent(), null)
    }

    fun dispose() {
        disposed = true
        decor.removeOnLayoutChangeListener(layoutListener)
        webView.removeOnLayoutChangeListener(layoutListener)
        if (decor.viewTreeObserver.isAlive) decor.viewTreeObserver.removeOnPreDrawListener(drawListener)
    }
}

package fr.releve.meteo

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import androidx.webkit.WebViewClientCompat

/**
 * Relevé dans une WebView : le build web de l'application, embarque, servi sous
 * https://appassets.androidplatform.net. L'application recopie ses lieux veilles dans
 * IndexedDB (meme origine que widget.html) et previent les widgets par `ReleveAndroid`.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private var pendingGeolocation: Pair<String, GeolocationPermissions.Callback>? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false
        val loader = WebAssets.loader(this)
        web.webViewClient =
            object : WebViewClientCompat() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) =
                    loader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == WebAssets.HOST) return false
                    // Un lien vers un autre site s'ouvre dans le navigateur, pas dans l'application.
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    return true
                }
            }
        web.webChromeClient =
            object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                        callback.invoke(origin, true, false)
                    } else {
                        pendingGeolocation = origin to callback
                        requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), REQUEST_LOCATION)
                    }
                }
            }
        web.addJavascriptInterface(Bridge(), "ReleveAndroid")
        web.loadUrl(intent?.data?.takeIf { it.host == WebAssets.HOST }?.toString() ?: WebAssets.APP_URL)
        WidgetScheduler.schedule(this)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_LOCATION) {
            val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
            pendingGeolocation?.let { (origin, callback) -> callback.invoke(origin, granted, false) }
            pendingGeolocation = null
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    /** Ce que la page peut demander a l'application. */
    private inner class Bridge {
        @JavascriptInterface
        fun refreshWidgets() {
            WidgetScheduler.refreshNow(applicationContext)
        }
    }

    private companion object {
        const val REQUEST_LOCATION = 1
    }
}

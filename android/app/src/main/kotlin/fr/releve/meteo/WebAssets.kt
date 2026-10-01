package fr.releve.meteo

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.IOException

/**
 * Sert le build web embarque (assets/web) sous une origine https unique. L'application et
 * la page sans interface des widgets partagent cette origine, donc le meme IndexedDB :
 * c'est ainsi que widget.html lit les lieux que l'application a recopies.
 */
object WebAssets {
    const val HOST = "appassets.androidplatform.net"
    const val APP_URL = "https://$HOST/index.html"
    const val WIDGET_URL = "https://$HOST/widget.html"

    fun loader(context: Context): WebViewAssetLoader =
        WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/") { path -> open(context, path) }
            .build()

    private fun open(context: Context, path: String): WebResourceResponse? {
        val name = if (path.isEmpty() || path.endsWith("/")) "${path}index.html" else path
        return try {
            WebResourceResponse(mime(name), "utf-8", context.assets.open("web/$name"))
        } catch (e: IOException) {
            null
        }
    }

    internal fun mime(name: String): String =
        when (name.substringAfterLast('.', "").lowercase()) {
            "html" -> "text/html"
            "js", "mjs" -> "text/javascript"
            "css" -> "text/css"
            "json" -> "application/json"
            "webmanifest" -> "application/manifest+json"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            "woff2" -> "font/woff2"
            "gz" -> "application/gzip"
            else -> "application/octet-stream"
        }
}

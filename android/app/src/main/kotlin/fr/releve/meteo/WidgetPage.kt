package fr.releve.meteo

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import androidx.webkit.WebViewClientCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** widget.html n'a pas rendu son contenu : echec de la page, du reseau ou du calcul. */
class WidgetPageException(message: String) : Exception(message)

/**
 * Charge widget.html dans une WebView sans interface et rend le contenu qu'elle publie.
 * La page est celle du build web : meme code que l'application pour choisir le modele,
 * meme Intl, meme fetch ; rien n'est reecrit en Kotlin.
 */
object WidgetPage {
    /** `search` : parametres de la page (`?lat=..&lon=..&nom=..`), pour un premier lancement ou un essai. */
    @SuppressLint("SetJavaScriptEnabled")
    suspend fun compute(context: Context, search: String = ""): String =
        withContext(Dispatchers.Main) {
            val app = context.applicationContext
            val web = WebView(app)
            try {
                suspendCancellableCoroutine { continuation ->
                    val loader = WebAssets.loader(app)
                    web.settings.javaScriptEnabled = true
                    web.settings.domStorageEnabled = true
                    web.settings.allowFileAccess = false
                    web.webViewClient =
                        object : WebViewClientCompat() {
                            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) =
                                loader.shouldInterceptRequest(request.url)

                            @Deprecated("Deprecated in Java")
                            override fun onReceivedError(view: WebView, errorCode: Int, description: String?, failingUrl: String?) {
                                if (failingUrl != null && failingUrl.startsWith(WebAssets.WIDGET_URL) && continuation.isActive) {
                                    continuation.resumeWithException(WidgetPageException("page illisible : $description"))
                                }
                            }
                        }
                    web.addJavascriptInterface(
                        object {
                            @JavascriptInterface
                            fun publish(json: String) {
                                if (continuation.isActive) continuation.resume(json)
                            }

                            @JavascriptInterface
                            fun fail(message: String) {
                                if (continuation.isActive) continuation.resumeWithException(WidgetPageException(message))
                            }
                        },
                        "ReleveAndroid",
                    )
                    // Sans fenetre, une WebView peut suspendre ses minuteries : on les relance.
                    web.onResume()
                    web.resumeTimers()
                    web.loadUrl(WebAssets.WIDGET_URL + search)
                }
            } finally {
                web.stopLoading()
                web.destroy()
            }
        }
}

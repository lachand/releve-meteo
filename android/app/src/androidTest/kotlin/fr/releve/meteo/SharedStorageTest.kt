package fr.releve.meteo

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.webkit.WebViewClientCompat
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Le point dont depend toute la variante : l'application (une WebView) recopie ses lieux
 * veilles dans IndexedDB, et la page sans interface des widgets (une autre WebView, sans
 * parametre) les relit. Meme origine, donc meme stockage.
 */
@RunWith(AndroidJUnit4::class)
class SharedStorageTest {
    @get:Rule
    val clean = CleanStorage()

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    private fun onMain(block: () -> Unit) = instrumentation.runOnMainSync(block)

    @SuppressLint("SetJavaScriptEnabled")
    @Test
    fun theWidgetPageReadsThePlacesTheAppMirrored() {
        val loaded = CountDownLatch(1)
        val mirrored = CountDownLatch(1)
        lateinit var web: WebView
        val loader = WebAssets.loader(context)
        onMain {
            web = WebView(context)
            web.settings.javaScriptEnabled = true
            web.settings.domStorageEnabled = true
            web.webViewClient =
                object : WebViewClientCompat() {
                    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) =
                        loader.shouldInterceptRequest(request.url)

                    override fun onPageFinished(view: WebView, url: String) {
                        if (url.endsWith("/sources.html")) loaded.countDown()
                    }
                }
            // Le pont de l'application : la page previent les widgets une fois ses lieux recopies.
            web.addJavascriptInterface(
                object {
                    @JavascriptInterface
                    fun refreshWidgets() {
                        mirrored.countDown()
                    }
                },
                "ReleveAndroid",
            )
            web.loadUrl("https://${WebAssets.HOST}/sources.html")
        }
        assertTrue("page statique non chargee", loaded.await(30, TimeUnit.SECONDS))

        // Un favori, comme l'utilisateur l'aurait ajoute, dans le localStorage de l'origine.
        val prefs =
            """{"version":1,"favourites":[{"id":"45.4900:5.4700","name":"Virieu","latitude":45.49,"longitude":5.47,"elevation":468,"admin":"Isère","alias":null}],"units":{"temperature":"C","wind":"kmh"},"theme":"auto","display":{"quick":false},"solar":{"peakKwp":null},"apiKeys":{"vigilance":null,"infoclimat":null},"alerts":[]}"""
        onMain { web.evaluateJavascript("localStorage.setItem('meteo-fr:prefs', ${org.json.JSONObject.quote(prefs)})", null) }

        // L'application s'ouvre : elle doit recopier le favori puis prevenir les widgets.
        onMain { web.loadUrl("https://${WebAssets.HOST}/index.html") }
        assertTrue("l'application n'a pas recopie ses lieux", mirrored.await(60, TimeUnit.SECONDS))
        onMain { web.destroy() }

        // La page des widgets, sans aucun parametre : seul IndexedDB peut lui donner le lieu.
        val worker = TestListenableWorkerBuilder<WidgetWorker>(context).build()
        val result = runBlocking { worker.doWork() }
        assertEquals(ListenableWorker.Result.success(), result)
        val shown = WidgetStore.load(context)
        assertEquals(listOf("Virieu"), shown.map { it.place.name })
        assertTrue(shown.single().place.now != null)
    }
}

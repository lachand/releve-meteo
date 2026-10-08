package fr.releve.meteo

import android.appwidget.AppWidgetManager
import android.content.ContentValues
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.os.Bundle
import android.provider.MediaStore
import android.view.View
import android.widget.FrameLayout
import androidx.glance.ExperimentalGlanceApi
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.runComposition
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.time.LocalDate
import java.time.ZoneId

/**
 * Les widgets tels qu'Android les dessine : le contenu est fixe (Virieu, un jour couvert), la taille
 * et le theme varient, et chaque rendu est enregistre en image (Pictures/releve-widgets) que la CI
 * recupere. Le reglage du rendu (paliers de hauteur, largeur de la courbe) se juge donc sur ces
 * images, sans telephone. Le test echoue seulement si un widget ne se compose pas ou reste vide.
 */
@OptIn(ExperimentalGlanceApi::class)
@RunWith(AndroidJUnit4::class)
class WidgetScreenshotTest {
    @get:Rule
    val clean = CleanStorage()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val target: Context = instrumentation.targetContext

    private companion object {
        /** Une ligne du bas entiere fait au moins 5 dp (capitales de 8 sp) ; une ligne coupee par le bas, moins de 4. */
        const val MIN_BOTTOM_LINE_DP = 4
    }

    private class Case(val name: String, val widget: () -> GlanceAppWidget, val widthDp: Int, val heightDp: Int, val fontScale: Float = 1f)

    private val classic =
        listOf(110 to 110, 110 to 230, 110 to 380, 160 to 230, 160 to 300, 160 to 380).map { (w, h) -> Case("petit-${w}x$h", { SmallWidget() }, w, h) } +
            listOf(300 to 110, 300 to 215, 300 to 285, 300 to 340, 300 to 400).map { (w, h) -> Case("grand-${w}x$h", { MediumWidget() }, w, h) }

    // La vignette : une case fait en pratique 57 a 90 dp de cote selon le lanceur.
    private val mini =
        listOf(57 to 57, 72 to 57, 72 to 72, 72 to 90, 90 to 90).map { (w, h) -> Case("mini-${w}x$h", { MiniWidget() }, w, h) }

    // La police du telephone agrandie (130 % et 200 %) : la vignette doit encore tout dire, sur moins de place.
    private val miniLargeFont =
        listOf(Triple(72, 72, 1.3f), Triple(90, 90, 1.3f), Triple(57, 57, 2f)).map { (w, h, scale) ->
            Case("mini-${w}x$h-police${(scale * 100).toInt()}", { MiniWidget() }, w, h, scale)
        }

    @Test
    fun theWidgetsComposeAtSeveralSizesInBothThemes() {
        var rendered = 0
        var expected = 0
        for (variant in WidgetScreenshotFixture.Variant.values()) {
            assertTrue("contenu illisible", WidgetStore.save(target, WidgetScreenshotFixture.json(variant)))
            // Les deux grands widgets avec le contenu normal ; la vignette avec les trois (alerte, nom long
            // et temperature negative ; contenu ancien), car c'est elle qui manque de place.
            val cases = if (variant == WidgetScreenshotFixture.Variant.NORMAL) classic + mini + miniLargeFont else mini
            for (case in cases) {
                for (night in listOf(true, false)) {
                    expected += 1
                    val bitmap = render(case, night)
                    val suffix = if (variant == WidgetScreenshotFixture.Variant.NORMAL) "" else "-${variant.key}"
                    // L'image d'abord : un rendu qui echoue reste visible dans l'artefact.
                    save(bitmap, "${case.name}$suffix-${if (night) "sombre" else "clair"}.png")
                    assertTrue("rendu vide : ${case.name} (${variant.key})", hasContent(bitmap))
                    if (case.name.startsWith("mini-")) {
                        // La ligne du bas de la vignette dit d'ou vient la temperature : coupee, elle ne dirait plus rien.
                        val density = target.resources.displayMetrics.density
                        val band = lastInkRun(bitmap, ((MiniLayout.BAR_DP + 1) * density).toInt())
                        val needed = (MIN_BOTTOM_LINE_DP * density).toInt()
                        assertTrue("ligne du bas coupee : ${case.name}$suffix (${band} px dessines, ${needed} attendus)", band >= needed)
                    }
                    rendered += 1
                }
            }
        }
        assertTrue(rendered == expected)
    }

    private fun contextFor(night: Boolean, fontScale: Float): Context {
        val config = Configuration(target.resources.configuration)
        config.fontScale = fontScale
        config.uiMode = (config.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
            if (night) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
        return target.createConfigurationContext(config)
    }

    private fun render(case: Case, night: Boolean): Bitmap {
        val context = contextFor(night, case.fontScale)
        // SizeMode.Exact lit la taille dans les options du widget : minimum et maximum identiques.
        val options =
            Bundle().apply {
                putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, case.widthDp)
                putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, case.widthDp)
                putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, case.heightDp)
                putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, case.heightDp)
            }
        val views = runBlocking { case.widget().runComposition(context, options = options).first() }
        val density = context.resources.displayMetrics.density
        val widthPx = (case.widthDp * density).toInt()
        val heightPx = (case.heightDp * density).toInt()
        lateinit var bitmap: Bitmap
        instrumentation.runOnMainSync {
            val parent = FrameLayout(context)
            val view: View = views.apply(context, parent)
            parent.addView(view, FrameLayout.LayoutParams(widthPx, heightPx))
            parent.measure(View.MeasureSpec.makeMeasureSpec(widthPx, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(heightPx, View.MeasureSpec.EXACTLY))
            parent.layout(0, 0, widthPx, heightPx)
            bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
            parent.draw(Canvas(bitmap))
        }
        return bitmap
    }

    /**
     * Hauteur, en pixels, de la derniere bande de lignes qui portent de l'encre (le bas du texte le plus bas),
     * hors de la barre de marge. Un texte coupe par le bas laisse une bande de quelques pixels seulement.
     */
    private fun lastInkRun(bitmap: Bitmap, leftPx: Int): Int {
        val background = bitmap.getPixel(bitmap.width - 2, bitmap.height / 2)
        var run = 0
        var last = 0
        for (y in 0 until bitmap.height) {
            var ink = false
            for (x in leftPx until bitmap.width - 1) {
                if (differs(bitmap.getPixel(x, y), background)) {
                    ink = true
                    break
                }
            }
            if (ink) {
                run += 1
                last = run
            } else {
                run = 0
            }
        }
        return last
    }

    private fun differs(a: Int, b: Int): Boolean =
        Math.abs(Color.red(a) - Color.red(b)) + Math.abs(Color.green(a) - Color.green(b)) + Math.abs(Color.blue(a) - Color.blue(b)) > 60

    /** Plus d'une couleur : un widget qui n'a rien dessine est un echec, pas une image blanche a juger. */
    private fun hasContent(bitmap: Bitmap): Boolean {
        val first = bitmap.getPixel(bitmap.width / 2, bitmap.height / 2)
        for (y in 0 until bitmap.height step 4) {
            for (x in 0 until bitmap.width step 4) {
                if (bitmap.getPixel(x, y) != first) return true
            }
        }
        return false
    }

    private fun save(bitmap: Bitmap, name: String) {
        val values =
            ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, name)
                put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/releve-widgets")
            }
        val resolver = target.contentResolver
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: error("impossible d'enregistrer $name")
        resolver.openOutputStream(uri)!!.use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}

/** Le contenu fixe des rendus : Virieu, un jour couvert, toutes les donnees presentes. */
object WidgetScreenshotFixture {
    private val PARIS = ZoneId.of("Europe/Paris")

    /** Normal ; alerte (nom tres long, temperature negative, vigilance en cours) ; contenu ancien de cinq heures. */
    enum class Variant(val key: String) {
        NORMAL("normal"),
        ALERT("alerte"),
        STALE("ancien"),
    }

    fun json(variant: Variant = Variant.NORMAL): String {
        val today = LocalDate.now(PARIS)
        val alert = variant == Variant.ALERT
        val now =
            WidgetNow(
                time = "${today}T20:00",
                // La variante d'alerte porte AROME France (« AROME FR »), plus large que AROME.
                model = if (alert) "arome_france" else "arome",
                temperature = if (alert) -12.4 else 14.2,
                others = 6,
                meanGap = 0.4,
                maxGap = 1.1,
                confidence = "high",
                icon = if (alert) "snow" else "cloudy",
                label = if (alert) "Neige" else "Couvert",
                windSpeed = 14.0,
                windGust = 26.0,
                humidity = 82.0,
            )
        val temps = listOf(14, 14, 13, 13, 13, 14, 15, 16, 17, 18, 19, 20, 21, 21, 21, 21, 20, 19, 18, 17, 16, 15, 15, 14)
        val track =
            temps.mapIndexed { index, t ->
                WidgetTrackPoint(
                    time = "${today}T%02d:00".format((8 + index) % 24),
                    model = if (index < 12) "arome" else "icon_eu",
                    temperature = t.toDouble(),
                    precipitation = if (index >= 22) 0.3 + (index - 22) * 0.6 else 0.0,
                )
            }
        val hours =
            (0 until 12).map { i ->
                WidgetHour("${today}T%02d:00".format((21 + i) % 24), "arome", temps[(i + 4) % temps.size].toDouble(), 0.0)
            }
        val days =
            listOf(
                WidgetForecastDay(today.toString(), "arome", 13.0, 21.0, 0.0, "cloudy", "Couvert"),
                WidgetForecastDay(today.plusDays(1).toString(), "arome", 15.0, 21.0, 4.2, "rain", "Pluie"),
                WidgetForecastDay(today.plusDays(2).toString(), "icon_eu", 16.0, 22.0, 6.0, "rain", "Pluie"),
                WidgetForecastDay(today.plusDays(3).toString(), "icon_eu", 13.0, 17.0, 1.1, "drizzle", "Bruine"),
            )
        val notes =
            (if (alert) listOf(WidgetNote("vigilance", "alert", "Vigilance orange neige-verglas (Isère) : de 18h à 6h. Source Météo-France.", "Vigilance orange neige-verglas")) else emptyList()) +
                listOf(
                    WidgetNote("rain", "info", "Pluie dès 23h, 1,2 mm sur 24 h, selon ICON-EU.", "Pluie à 23h"),
                    WidgetNote("reliability", "info", "AROME : 0,6 °C d’erreur moyenne ici, d’après les mesures de la station (300 heures).", "AROME : 0,6 °C d’erreur ici"),
                )
        val place =
            WidgetPlace(
                id = "45.4900:5.4700",
                name = if (alert) "Saint-Étienne-de-Saint-Geoirs" else "Virieu",
                link = "?lat=45.49&lon=5.47&nom=Virieu&alt=468",
                now = now,
                hours = hours,
                day = WidgetDay(14.0, 21.0, 1.2, 26.0),
                days = days,
                notes = notes,
                sun = WidgetSun("07:42", "19:21"),
                track = track,
            )
        val generatedAt = System.currentTimeMillis() - if (variant == Variant.STALE) 5L * 60 * 60 * 1000 else 0L
        return WidgetJson.encodeToString(WidgetPayload.serializer(), WidgetPayload(1, generatedAt, listOf(place)))
    }
}

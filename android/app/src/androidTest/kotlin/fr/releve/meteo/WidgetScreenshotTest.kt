package fr.releve.meteo

import android.appwidget.AppWidgetManager
import android.content.ContentValues
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
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

    private class Case(val name: String, val widget: () -> GlanceAppWidget, val widthDp: Int, val heightDp: Int)

    private val cases =
        listOf(110 to 110, 110 to 190, 110 to 250, 110 to 300).map { (w, h) -> Case("petit-${w}x$h", { SmallWidget() }, w, h) } +
            listOf(300 to 110, 300 to 185, 300 to 250, 300 to 300, 300 to 340).map { (w, h) -> Case("grand-${w}x$h", { MediumWidget() }, w, h) }

    @Test
    fun theWidgetsComposeAtSeveralSizesInBothThemes() {
        assertTrue("contenu illisible", WidgetStore.save(target, WidgetScreenshotFixture.json()))
        var rendered = 0
        for (case in cases) {
            for (night in listOf(true, false)) {
                val bitmap = render(case, night)
                assertTrue("rendu vide : ${case.name}", hasContent(bitmap))
                save(bitmap, "${case.name}-${if (night) "sombre" else "clair"}.png")
                rendered += 1
            }
        }
        assertTrue(rendered == cases.size * 2)
    }

    private fun contextFor(night: Boolean): Context {
        val config = Configuration(target.resources.configuration)
        config.uiMode = (config.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
            if (night) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
        return target.createConfigurationContext(config)
    }

    private fun render(case: Case, night: Boolean): Bitmap {
        val context = contextFor(night)
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

    fun json(): String {
        val today = LocalDate.now(PARIS)
        val now =
            WidgetNow(
                time = "${today}T20:00",
                model = "arome",
                temperature = 14.2,
                others = 6,
                meanGap = 0.4,
                maxGap = 1.1,
                confidence = "high",
                icon = "cloudy",
                label = "Couvert",
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
            listOf(
                WidgetNote("rain", "info", "Pluie dès 23h, 1,2 mm sur 24 h, selon ICON-EU.", "Pluie à 23h"),
                WidgetNote("reliability", "info", "AROME : 0,6 °C d’erreur moyenne ici, d’après les mesures de la station (300 heures).", "AROME : 0,6 °C d’erreur ici"),
            )
        val place =
            WidgetPlace(
                id = "45.4900:5.4700",
                name = "Virieu",
                link = "?lat=45.49&lon=5.47&nom=Virieu&alt=468",
                now = now,
                hours = hours,
                day = WidgetDay(14.0, 21.0, 1.2, 26.0),
                days = days,
                notes = notes,
                sun = WidgetSun("07:42", "19:21"),
                track = track,
            )
        return WidgetJson.encodeToString(WidgetPayload.serializer(), WidgetPayload(1, System.currentTimeMillis(), listOf(place)))
    }
}

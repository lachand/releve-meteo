package fr.releve.meteo

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max

/*
 * La courbe de 24 heures du grand widget : la temperature du modele retenu heure par heure, la
 * pluie en barres, et au-dessus une bande par modele. Le changement de modele se voit donc sur la
 * courbe elle-meme (regle 6 : jamais de raccord lisse en silence). Le calcul (ChartModel) est du
 * Kotlin pur, teste cote JVM ; le dessin (WidgetChartRenderer) n'ecrit que dans un bitmap.
 */

/** Une suite d'heures consecutives portee par le meme modele : indices `from` a `to` inclus. */
class ChartRun(val model: String, val from: Int, val to: Int)

class ChartModel(
    val temps: List<Double?>,
    val rain: List<Double?>,
    val hourLabels: List<String>,
    val min: Double,
    val max: Double,
    val maxRain: Double,
    val runs: List<ChartRun>,
)

object WidgetChartMath {
    /** Moins de trois temperatures connues : pas de courbe, plutot qu'un trait qui ne dit rien. */
    private const val MIN_KNOWN = 3

    /** Etendue minimale de l'axe, degres : une journee plate ne devient pas une montagne. */
    private const val MIN_SPAN = 4.0

    /** Pluie a partir de laquelle les barres atteignent leur hauteur maximale, mm par heure. */
    private const val RAIN_FULL_SCALE = 2.0

    fun build(track: List<WidgetTrackPoint>): ChartModel? {
        val temps = track.map { it.temperature }
        val known = temps.filterNotNull()
        if (known.size < MIN_KNOWN) return null
        var low = floor(known.min())
        var high = ceil(known.max())
        if (high - low < MIN_SPAN) {
            val middle = (low + high) / 2
            low = middle - MIN_SPAN / 2
            high = middle + MIN_SPAN / 2
        }
        val runs = mutableListOf<ChartRun>()
        track.forEachIndexed { index, point ->
            val last = runs.lastOrNull()
            if (last != null && last.model == point.model) {
                runs[runs.lastIndex] = ChartRun(last.model, last.from, index)
            } else {
                runs += ChartRun(point.model, index, index)
            }
        }
        val rain = track.map { it.precipitation }
        return ChartModel(
            temps = temps,
            rain = rain,
            hourLabels = track.map { WidgetFormat.hourLabel(it.time) },
            min = low,
            max = high,
            maxRain = max(RAIN_FULL_SCALE, rain.filterNotNull().maxOrNull() ?: 0.0),
            runs = runs,
        )
    }

    /** « 24 H : AROME puis ICON-EU », ou « 24 H : AROME » avec un seul modele. */
    fun caption(runs: List<ChartRun>): String {
        val names = runs.map { WidgetFormat.modelLabel(it.model) }.distinct()
        return "24 H : " + names.joinToString(" puis ")
    }
}

/** Couleurs du dessin (ARVB resolues), calculees pour le theme choisi et le mode jour ou nuit. */
class ChartColors(val ink: Int, val faint: Int, val rain: Int, val line: Int, val bands: IntArray)

object WidgetChartRenderer {
    private val BAND_COLORS = intArrayOf(0xFF7AA2C8.toInt(), 0xFFC9A46A.toInt(), 0xFF8FB98A.toInt())

    fun colorsFor(theme: WidgetTheme, night: Boolean): ChartColors {
        val dark = theme == WidgetTheme.DARK || (theme == WidgetTheme.AUTO && night)
        return if (dark) {
            ChartColors(0xFFE8E1D2.toInt(), 0xFFA39A8B.toInt(), 0xFF8DB4DB.toInt(), 0xFF2B3642.toInt(), BAND_COLORS)
        } else {
            ChartColors(0xFF1C2733.toInt(), 0xFF5B6570.toInt(), 0xFF2F5D8A.toInt(), 0xFFD3CAB5.toInt(), BAND_COLORS)
        }
    }

    fun render(m: ChartModel, widthPx: Int, heightPx: Int, density: Float, c: ChartColors): Bitmap {
        val bitmap = Bitmap.createBitmap(widthPx.coerceAtLeast(1), heightPx.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val w = widthPx.toFloat()
        val h = heightPx.toFloat()
        val pad = 6f * density
        val n = m.temps.size
        fun x(i: Int): Float = if (n <= 1) w / 2 else pad + i * (w - 2 * pad) / (n - 1)

        // La bande des modeles, en haut : un segment par modele, un petit ecart entre deux.
        val bandH = 6f * density
        val gap = 1.5f * density
        val band = Paint(Paint.ANTI_ALIAS_FLAG)
        m.runs.forEachIndexed { index, run ->
            band.color = c.bands[index % c.bands.size]
            val left = if (run.from == 0) 0f else (x(run.from - 1) + x(run.from)) / 2 + gap
            val right = if (run.to == n - 1) w else (x(run.to) + x(run.to + 1)) / 2 - gap
            canvas.drawRoundRect(RectF(left, 0f, right, bandH), bandH / 2, bandH / 2, band)
        }

        val top = bandH + 16f * density
        val bottom = h - 14f * density
        val plot = bottom - top
        fun y(t: Double): Float = bottom - ((t - m.min) / (m.max - m.min)).toFloat() * plot

        // La pluie : des barres au pied de la courbe ; une heure sans valeur n'en dessine pas.
        val bars = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = c.rain }
        m.rain.forEachIndexed { i, mm ->
            if (mm != null && mm > 0.0) {
                val barH = (mm / m.maxRain).toFloat().coerceAtMost(1f) * plot * 0.4f
                canvas.drawRoundRect(RectF(x(i) - 2f * density, bottom - barH, x(i) + 2f * density, bottom), density, density, bars)
            }
        }

        // La courbe : lissee entre deux heures connues, interrompue devant une heure sans valeur.
        val line = Path()
        val fill = Path()
        var open = false
        var firstX = 0f
        var prevX = 0f
        var prevY = 0f
        m.temps.forEachIndexed { i, t ->
            if (t == null) {
                if (open) {
                    fill.lineTo(prevX, bottom)
                    fill.lineTo(firstX, bottom)
                    fill.close()
                }
                open = false
                return@forEachIndexed
            }
            val px = x(i)
            val py = y(t)
            if (!open) {
                line.moveTo(px, py)
                fill.moveTo(px, bottom)
                fill.lineTo(px, py)
                firstX = px
                open = true
            } else {
                val cx = (prevX + px) / 2
                line.cubicTo(cx, prevY, cx, py, px, py)
                fill.cubicTo(cx, prevY, cx, py, px, py)
            }
            prevX = px
            prevY = py
        }
        if (open) {
            fill.lineTo(prevX, bottom)
            fill.lineTo(firstX, bottom)
            fill.close()
        }
        val shade = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(0f, top, 0f, bottom, (c.ink and 0x00FFFFFF) or 0x4D000000, c.ink and 0x00FFFFFF, Shader.TileMode.CLAMP)
        }
        canvas.drawPath(fill, shade)
        val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 2f * density
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            color = c.ink
        }
        canvas.drawPath(line, stroke)

        // Les extremes, ecrits : le plus chaud au-dessus de son point, le plus froid juste au-dessus du sien.
        val known = m.temps.mapIndexedNotNull { i, t -> if (t == null) null else i to t }
        val hottest = known.maxByOrNull { it.second }
        val coldest = known.minByOrNull { it.second }
        val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = 10f * density
            textAlign = Paint.Align.CENTER
        }
        if (hottest != null) {
            label.color = c.ink
            label.isFakeBoldText = true
            canvas.drawText(WidgetFormat.degrees(hottest.second), x(hottest.first).coerceIn(14f * density, w - 14f * density), y(hottest.second) - 5f * density, label)
        }
        if (coldest != null && coldest.first != hottest?.first && coldest.second < (hottest?.second ?: coldest.second)) {
            label.color = c.faint
            label.isFakeBoldText = false
            canvas.drawText(WidgetFormat.degrees(coldest.second), x(coldest.first).coerceIn(14f * density, w - 14f * density), y(coldest.second) - 5f * density, label)
        }

        // Le point de depart (maintenant) et les heures, de six en six.
        canvas.drawCircle(x(0), m.temps.firstOrNull()?.let { y(it) } ?: bottom, 3f * density, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = c.ink })
        label.color = c.faint
        label.isFakeBoldText = false
        for (i in 0 until n step 6) {
            canvas.drawText(m.hourLabels[i], x(i).coerceIn(10f * density, w - 10f * density), h - 2f * density, label)
        }
        return bitmap
    }
}

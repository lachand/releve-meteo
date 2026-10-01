package fr.releve.meteo

import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontStyle
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import java.util.Locale

/* Le type d'une couleur claire et sombre ; `androidx.glance.color.ColorProvider` en est la fabrique. */
typealias Ink = androidx.glance.unit.ColorProvider

/** Les couleurs du carnet (DESIGN.md) : papier et encre. */
class Palette(val paper: Ink, val ink: Ink, val faint: Ink, val margin: Ink, val rain: Ink)

private val LIGHT_PAPER = Color(0xFFF2EDE2)
private val LIGHT_INK = Color(0xFF1C2733)
private val LIGHT_FAINT = Color(0xFF5B6570)
private val LIGHT_MARGIN = Color(0xFFAC4336)
private val LIGHT_RAIN = Color(0xFF2F5D8A)
private val DARK_PAPER = Color(0xFF131920)
private val DARK_INK = Color(0xFFE8E1D2)
private val DARK_FAINT = Color(0xFFA39A8B)
private val DARK_MARGIN = Color(0xFFE0715F)
private val DARK_RAIN = Color(0xFF8DB4DB)

/** Automatique : clair le jour, sombre la nuit, comme le telephone ; clair ou sombre : toujours le meme. */
fun paletteOf(theme: WidgetTheme): Palette =
    when (theme) {
        WidgetTheme.AUTO ->
            Palette(
                ColorProvider(day = LIGHT_PAPER, night = DARK_PAPER),
                ColorProvider(day = LIGHT_INK, night = DARK_INK),
                ColorProvider(day = LIGHT_FAINT, night = DARK_FAINT),
                ColorProvider(day = LIGHT_MARGIN, night = DARK_MARGIN),
                ColorProvider(day = LIGHT_RAIN, night = DARK_RAIN),
            )
        WidgetTheme.LIGHT ->
            Palette(
                ColorProvider(day = LIGHT_PAPER, night = LIGHT_PAPER),
                ColorProvider(day = LIGHT_INK, night = LIGHT_INK),
                ColorProvider(day = LIGHT_FAINT, night = LIGHT_FAINT),
                ColorProvider(day = LIGHT_MARGIN, night = LIGHT_MARGIN),
                ColorProvider(day = LIGHT_RAIN, night = LIGHT_RAIN),
            )
        WidgetTheme.DARK ->
            Palette(
                ColorProvider(day = DARK_PAPER, night = DARK_PAPER),
                ColorProvider(day = DARK_INK, night = DARK_INK),
                ColorProvider(day = DARK_FAINT, night = DARK_FAINT),
                ColorProvider(day = DARK_MARGIN, night = DARK_MARGIN),
                ColorProvider(day = DARK_RAIN, night = DARK_RAIN),
            )
    }

/** Le texte de l'etat vide : rien n'est devine, on dit quoi faire. */
const val EMPTY_TEXT = "Ouvrez Relevé et ajoutez un lieu en favori."

/** Hauteur a partir de laquelle un widget montre aussi l'ecart des autres modeles et les heures a venir. */
val ROOMY_HEIGHT: Dp = 180.dp

val COLUMN_GAP: Dp = 8.dp

/**
 * La feuille du carnet : papier, filet rouge de la marge a gauche, coins arrondis. Un clic
 * ouvre l'application sur le lieu du widget (`link`), ou sans lieu quand il n'y en a pas.
 */
@Composable
fun WidgetFrame(link: String, p: Palette, content: @Composable () -> Unit) {
    val context = LocalContext.current
    val intent =
        Intent(context, MainActivity::class.java).apply {
            if (link.isNotEmpty()) data = Uri.parse(WebAssets.APP_URL + link)
        }
    Row(
        modifier =
            GlanceModifier
                .fillMaxSize()
                .background(p.paper)
                .cornerRadius(16.dp)
                .clickable(actionStartActivity(intent)),
    ) {
        Box(modifier = GlanceModifier.width(4.dp).fillMaxHeight().background(p.margin)) {}
        Column(modifier = GlanceModifier.fillMaxSize().padding(horizontal = 10.dp, vertical = 8.dp)) {
            content()
        }
    }
}

@Composable
fun Label(
    text: String,
    size: TextUnit,
    color: Ink,
    bold: Boolean = false,
    italic: Boolean = false,
    maxLines: Int = 1,
    modifier: GlanceModifier = GlanceModifier,
) {
    Text(
        text = text,
        modifier = modifier,
        style =
            TextStyle(
                color = color,
                fontSize = size,
                fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal,
                fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
            ),
        maxLines = maxLines,
    )
}

@Composable
fun SmallText(text: String, p: Palette, faint: Boolean = true, italic: Boolean = false) {
    Label(text, 11.sp, if (faint) p.faint else p.ink, italic = italic, maxLines = 3)
}

/** Le pictogramme du temps, s'il y en a un ; son nom est dit a l'oreille (lecteur d'ecran). */
@Composable
fun WeatherIcon(icon: String?, label: String?, size: Dp) {
    val res = WidgetIcons.drawable(icon) ?: return
    Image(
        provider = ImageProvider(res),
        contentDescription = label,
        modifier = GlanceModifier.size(size),
    )
}

/**
 * Le bulletin d'un lieu : nom, « AROME prévoit », la temperature en grand avec l'icone du temps,
 * puis la provenance (prevu) et la confiance. Un contenu ancien est grise.
 */
@Composable
fun PlaceBlock(
    shown: ShownPlace,
    nowMs: Long,
    p: Palette,
    temperatureSize: TextUnit = 30.sp,
    iconSize: Dp = 30.dp,
    roomy: Boolean = false,
) {
    val stale = WidgetFormat.isStale(shown.generatedAtMs, nowMs)
    val now = shown.place.now
    Label(shown.place.name.uppercase(Locale.FRANCE), 10.sp, p.faint, bold = true)
    if (now == null) {
        SmallText("Pas de prévision pour cette heure.", p)
    } else {
        Label(WidgetFormat.lead(now), 12.sp, p.faint)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Label(WidgetFormat.temperature(now.temperature), temperatureSize, if (stale) p.faint else p.ink, bold = true)
            Spacer(GlanceModifier.width(6.dp))
            WeatherIcon(now.icon, now.label, iconSize)
        }
        if (roomy) {
            now.label?.let { Label(it, 10.sp, p.ink) }
        }
        // Une prevision, pas une mesure : la provenance est dite.
        Label("prévu" + (WidgetFormat.confidence(now)?.let { " · $it" } ?: ""), 10.sp, p.faint, italic = true, maxLines = 2)
    }
}

/** La date de mise a jour ; un contenu ancien le dit, en rouge de marge, avec son age. */
@Composable
fun Freshness(shown: ShownPlace, nowMs: Long, p: Palette) {
    val stale = WidgetFormat.isStale(shown.generatedAtMs, nowMs)
    Label(
        WidgetFormat.freshness(shown.generatedAtMs, nowMs),
        10.sp,
        if (stale) p.margin else p.faint,
        bold = stale,
        maxLines = 2,
    )
}

/** « Les 5 autres modèles s'écartent de 0,8 °C… » : le modele retenu n'est jamais dit seul quand il y a la place. */
@Composable
fun SpreadLine(shown: ShownPlace, p: Palette) {
    shown.place.now?.let { Label(WidgetFormat.spread(it), 10.sp, p.ink, maxLines = 4) }
}

/** Les heures a venir en liste, de trois en trois : l'heure, la temperature, la pluie. Une valeur absente reste un tiret. */
@Composable
fun HoursList(hours: List<WidgetHour>, p: Palette, count: Int = 4) {
    hours.filterIndexed { index, _ -> index % 3 == 2 }.take(count).forEach { hour ->
        Row(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 1.dp)) {
            Label(WidgetFormat.hourLabel(hour.time), 11.sp, p.faint, modifier = GlanceModifier.width(30.dp))
            Label(WidgetFormat.degrees(hour.temperature), 13.sp, p.ink, bold = true, modifier = GlanceModifier.width(36.dp))
            val rain = WidgetFormat.rain(hour.precipitation)
            val wet = rain != null && rain != "0"
            Label(rain?.let { "$it mm" } ?: "–", 11.sp, if (wet) p.rain else p.faint, bold = wet)
        }
    }
}

/** Les jours a venir en colonnes : le jour, l'icone du temps, le maximum, le minimum. Une valeur absente reste un tiret. */
@Composable
fun DaysStrip(days: List<WidgetForecastDay>, nowMs: Long, p: Palette) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        days.forEach { day ->
            Column(modifier = GlanceModifier.defaultWeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                Label(WidgetFormat.dayName(day.date, nowMs), 10.sp, p.faint)
                if (WidgetIcons.drawable(day.icon) != null) {
                    WeatherIcon(day.icon, day.label, 22.dp)
                } else {
                    Spacer(GlanceModifier.size(22.dp))
                }
                Label(WidgetFormat.degrees(day.tempMax), 13.sp, p.ink, bold = true)
                Label(WidgetFormat.degrees(day.tempMin), 11.sp, p.faint)
            }
        }
    }
}

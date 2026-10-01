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
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontStyle
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import java.util.Locale

/* Le type d'une couleur claire et sombre ; `androidx.glance.color.ColorProvider` en est la fabrique. */
typealias Ink = androidx.glance.unit.ColorProvider

/* Les couleurs du carnet (DESIGN.md) : papier et encre, clair et sombre. */
val PAPER = ColorProvider(day = Color(0xFFF2EDE2), night = Color(0xFF131920))
val INK = ColorProvider(day = Color(0xFF1C2733), night = Color(0xFFE8E1D2))
val INK_FAINT = ColorProvider(day = Color(0xFF5B6570), night = Color(0xFFA39A8B))
val MARGIN = ColorProvider(day = Color(0xFFAC4336), night = Color(0xFFE0715F))
val RAIN = ColorProvider(day = Color(0xFF2F5D8A), night = Color(0xFF8DB4DB))

/** Le texte de l'etat vide : rien n'est devine, on dit quoi faire. */
const val EMPTY_TEXT = "Ouvrez Relevé et ajoutez un lieu en favori."

/**
 * La feuille du carnet : papier, filet rouge de la marge a gauche, coins arrondis. Un clic
 * ouvre l'application sur le lieu du widget (`link`), ou sans lieu quand il n'y en a pas.
 */
@Composable
fun WidgetFrame(link: String, content: @Composable () -> Unit) {
    val context = LocalContext.current
    val intent =
        Intent(context, MainActivity::class.java).apply {
            if (link.isNotEmpty()) data = Uri.parse(WebAssets.APP_URL + link)
        }
    Row(
        modifier =
            GlanceModifier
                .fillMaxSize()
                .background(PAPER)
                .cornerRadius(16.dp)
                .clickable(actionStartActivity(intent)),
    ) {
        Box(modifier = GlanceModifier.width(4.dp).fillMaxHeight().background(MARGIN)) {}
        Column(modifier = GlanceModifier.fillMaxSize().padding(horizontal = 10.dp, vertical = 8.dp)) {
            content()
        }
    }
}

@Composable
fun Label(
    text: String,
    size: TextUnit,
    color: Ink = INK_FAINT,
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
fun SmallText(text: String, faint: Boolean = true, italic: Boolean = false) {
    Label(text, 11.sp, if (faint) INK_FAINT else INK, italic = italic, maxLines = 3)
}

/**
 * Le bulletin d'un lieu : nom, « AROME prévoit », la temperature en grand, puis la
 * provenance (prevu) et la confiance. Un contenu ancien est grise.
 */
@Composable
fun PlaceBlock(shown: ShownPlace, nowMs: Long, temperatureSize: TextUnit = 30.sp) {
    val stale = WidgetFormat.isStale(shown.generatedAtMs, nowMs)
    val now = shown.place.now
    Label(shown.place.name.uppercase(Locale.FRANCE), 10.sp, INK_FAINT, bold = true)
    if (now == null) {
        SmallText("Pas de prévision pour cette heure.")
    } else {
        Label(WidgetFormat.lead(now), 12.sp, INK_FAINT)
        Label(WidgetFormat.temperature(now.temperature), temperatureSize, if (stale) INK_FAINT else INK, bold = true)
        // Une prevision, pas une mesure : la provenance est dite.
        Label("prévu" + (WidgetFormat.confidence(now)?.let { " · $it" } ?: ""), 10.sp, INK_FAINT, italic = true, maxLines = 2)
    }
}

/** La date de mise a jour ; un contenu ancien le dit, en rouge de marge, avec son age. */
@Composable
fun Freshness(shown: ShownPlace, nowMs: Long) {
    val stale = WidgetFormat.isStale(shown.generatedAtMs, nowMs)
    Label(
        WidgetFormat.freshness(shown.generatedAtMs, nowMs),
        10.sp,
        if (stale) MARGIN else INK_FAINT,
        bold = stale,
        maxLines = 2,
    )
}

val COLUMN_GAP: Dp = 8.dp

/** Hauteur a partir de laquelle un widget montre aussi l'ecart des autres modeles et les heures a venir. */
val ROOMY_HEIGHT: Dp = 180.dp

/** « Les 5 autres modèles s'écartent de 0,8 °C… » : le modele retenu n'est jamais dit seul quand il y a la place. */
@Composable
fun SpreadLine(shown: ShownPlace) {
    shown.place.now?.let { Label(WidgetFormat.spread(it), 10.sp, INK, maxLines = 4) }
}

/** Les heures a venir en liste, de trois en trois : l'heure, la temperature, la pluie. Une valeur absente reste un tiret. */
@Composable
fun HoursList(hours: List<WidgetHour>, count: Int = 4) {
    hours.filterIndexed { index, _ -> index % 3 == 2 }.take(count).forEach { hour ->
        Row(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 1.dp)) {
            Label(WidgetFormat.hourLabel(hour.time), 11.sp, INK_FAINT, modifier = GlanceModifier.width(30.dp))
            Label(
                hour.temperature?.let { "${Math.round(it)}°" } ?: "–",
                13.sp,
                INK,
                bold = true,
                modifier = GlanceModifier.width(36.dp),
            )
            val rain = WidgetFormat.rain(hour.precipitation)
            val wet = rain != null && rain != "0"
            Label(rain?.let { "$it mm" } ?: "–", 11.sp, if (wet) RAIN else INK_FAINT, bold = wet)
        }
    }
}

package fr.releve.meteo

import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import android.content.Context
import android.content.res.Configuration
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontStyle
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import java.util.Locale

/* Le type d'une couleur claire et sombre ; `androidx.glance.color.ColorProvider` en est la fabrique. */
typealias Ink = androidx.glance.unit.ColorProvider

/** Les couleurs du carnet (DESIGN.md) : papier et encre. */
class Palette(
    val paper: Ink,
    val ink: Ink,
    val faint: Ink,
    val margin: Ink,
    val rain: Ink,
    /** Un fond un peu different du papier : la colonne d'aujourd'hui. */
    val panel: Ink,
    /** Les filets entre sections. */
    val line: Ink,
)

private val LIGHT_PAPER = Color(0xFFF2EDE2)
private val LIGHT_INK = Color(0xFF1C2733)
private val LIGHT_FAINT = Color(0xFF5B6570)
private val LIGHT_MARGIN = Color(0xFFAC4336)
private val LIGHT_RAIN = Color(0xFF2F5D8A)
private val LIGHT_PANEL = Color(0xFFE8E0CE)
private val LIGHT_LINE = Color(0xFFD3CAB5)
private val DARK_PANEL = Color(0xFF1D2630)
private val DARK_LINE = Color(0xFF2B3642)
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
                ColorProvider(day = LIGHT_PANEL, night = DARK_PANEL),
                ColorProvider(day = LIGHT_LINE, night = DARK_LINE),
            )
        WidgetTheme.LIGHT ->
            Palette(
                ColorProvider(day = LIGHT_PAPER, night = LIGHT_PAPER),
                ColorProvider(day = LIGHT_INK, night = LIGHT_INK),
                ColorProvider(day = LIGHT_FAINT, night = LIGHT_FAINT),
                ColorProvider(day = LIGHT_MARGIN, night = LIGHT_MARGIN),
                ColorProvider(day = LIGHT_RAIN, night = LIGHT_RAIN),
                ColorProvider(day = LIGHT_PANEL, night = LIGHT_PANEL),
                ColorProvider(day = LIGHT_LINE, night = LIGHT_LINE),
            )
        WidgetTheme.DARK ->
            Palette(
                ColorProvider(day = DARK_PAPER, night = DARK_PAPER),
                ColorProvider(day = DARK_INK, night = DARK_INK),
                ColorProvider(day = DARK_FAINT, night = DARK_FAINT),
                ColorProvider(day = DARK_MARGIN, night = DARK_MARGIN),
                ColorProvider(day = DARK_RAIN, night = DARK_RAIN),
                ColorProvider(day = DARK_PANEL, night = DARK_PANEL),
                ColorProvider(day = DARK_LINE, night = DARK_LINE),
            )
    }

/** Le texte de l'etat vide : rien n'est devine, on dit quoi faire. */
const val EMPTY_TEXT = "Ouvrez Relevé et ajoutez un lieu en favori."

/*
 * Glance ne garde que les 10 premiers enfants d'un Row, d'une Column ou d'une Box : les suivants
 * disparaissent sans erreur (c'est ainsi que la phrase « Sur 24 h » avait disparu). Chaque bloc
 * ci-dessous est donc UN enfant, et les conteneurs qui les assemblent restent sous cette limite.
 */
const val CHILD_LIMIT = 10

val COLUMN_GAP: Dp = 8.dp

/**
 * La feuille du carnet : papier, filet rouge de la marge a gauche, coins arrondis. Un clic
 * ouvre l'application sur le lieu du widget (`link`), ou sans lieu quand il n'y en a pas.
 */
@Composable
fun WidgetFrame(
    link: String,
    p: Palette,
    barWidth: Dp = 4.dp,
    horizontal: Dp = 10.dp,
    vertical: Dp = 6.dp,
    /** Ce que le lecteur d'ecran dit de la feuille entiere ; sans valeur, il lit les textes un a un. */
    description: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val context = LocalContext.current
    val intent =
        Intent(context, MainActivity::class.java).apply {
            if (link.isNotEmpty()) data = Uri.parse(WebAssets.APP_URL + link)
        }
    val sheet =
        GlanceModifier
            .fillMaxSize()
            .background(p.paper)
            .cornerRadius(16.dp)
            .clickable(actionStartActivity(intent))
    Row(modifier = if (description == null) sheet else sheet.semantics { contentDescription = description }) {
        Box(modifier = GlanceModifier.width(barWidth).fillMaxHeight().background(p.margin)) {}
        Column(modifier = GlanceModifier.fillMaxSize().padding(horizontal = horizontal, vertical = vertical)) {
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
 * Le bulletin d'un lieu : le nom, la temperature en grand avec l'icone du temps, le nom du temps,
 * puis « AROME prévoit » et la confiance (provenance : une prevision, pas une mesure). Un contenu
 * ancien est grise. Un seul enfant pour le conteneur parent (voir CHILD_LIMIT).
 */
@Composable
fun PlaceBlock(
    shown: ShownPlace,
    nowMs: Long,
    p: Palette,
    temperatureSize: TextUnit = 52.sp,
    iconSize: Dp = 30.dp,
    withLead: Boolean = true,
) {
    val stale = WidgetFormat.isStale(shown.generatedAtMs, nowMs)
    val now = shown.place.now
    Column {
        Label(shown.place.name.uppercase(Locale.FRANCE), 10.sp, p.faint, bold = true)
        if (now == null) {
            SmallText("Pas de prévision pour cette heure.", p)
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Label(WidgetFormat.degrees(now.temperature), temperatureSize, if (stale) p.faint else p.ink)
                Spacer(GlanceModifier.width(6.dp))
                WeatherIcon(now.icon, now.label, iconSize)
            }
            now.label?.let { Label(it, 12.sp, p.ink) }
            if (withLead) {
                Label(WidgetFormat.lead(now) + (WidgetFormat.confidence(now)?.let { " · $it" } ?: ""), 10.sp, p.faint, italic = true, maxLines = 2)
            }
        }
    }
}

/** Un appui sur la ligne de mise a jour recalcule les widgets tout de suite. */
class RefreshAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        WidgetScheduler.refreshNow(context)
    }
}

/** La date de mise a jour (« ↻ » : un appui la recalcule) ; un contenu ancien le dit, en rouge de marge, avec son age. */
@Composable
fun Freshness(shown: ShownPlace, nowMs: Long, p: Palette) {
    val stale = WidgetFormat.isStale(shown.generatedAtMs, nowMs)
    Label(
        "↻ " + WidgetFormat.freshness(shown.generatedAtMs, nowMs),
        10.sp,
        if (stale) p.margin else p.faint,
        bold = stale,
        maxLines = 2,
        modifier = GlanceModifier.fillMaxWidth().padding(vertical = 2.dp).clickable(actionRunCallback<RefreshAction>()),
    )
}

/** Un appui sur la note du pied : la suivante. */
class NextNoteAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(glanceId)
        val choice = WidgetConfig.load(context, appWidgetId)
        val count = pickPlace(WidgetStore.load(context), choice.placeId)?.place?.notes?.size ?: 0
        WidgetConfig.cycleNote(context, appWidgetId, count)
    }
}

/**
 * La ligne du pied. Un contenu ancien le dit d'abord (jamais une donnee ancienne presentee comme
 * actuelle) ; sinon la note la plus importante du lieu, que la page a choisie et dont elle dit la
 * source, et un appui passe a la suivante (« 2/5 ») ; sans note, l'heure de mise a jour. L'heure
 * reste toujours touchable pour recalculer. `compact` : une ligne etroite, version courte.
 */
@Composable
fun Footer(shown: ShownPlace, nowMs: Long, p: Palette, noteIndex: Int, compact: Boolean) {
    val note = noteAt(shown.place.notes, noteIndex)
    if (WidgetFormat.isStale(shown.generatedAtMs, nowMs) || note == null) {
        Freshness(shown, nowMs, p)
        return
    }
    val alert = note.level == "alert"
    Row(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Label(
            if (compact) note.short else note.text,
            10.sp,
            if (alert) p.margin else p.ink,
            bold = alert,
            maxLines = if (compact) 1 else 2,
            modifier = GlanceModifier.defaultWeight().clickable(actionRunCallback<NextNoteAction>()),
        )
        if (!compact && shown.place.notes.size > 1) {
            Label(
                "  ${Math.floorMod(noteIndex, shown.place.notes.size) + 1}/${shown.place.notes.size} ›",
                10.sp,
                p.faint,
                modifier = GlanceModifier.clickable(actionRunCallback<NextNoteAction>()),
            )
        }
        Label(
            "  ↻" + if (compact) "" else " ${WidgetFormat.clock(shown.generatedAtMs)}",
            10.sp,
            p.faint,
            modifier = GlanceModifier.clickable(actionRunCallback<RefreshAction>()),
        )
    }
}

/** Un filet entre deux sections : un seul enfant pour le conteneur parent. */
@Composable
fun Divider(p: Palette) {
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        Spacer(GlanceModifier.height(5.dp))
        Box(modifier = GlanceModifier.fillMaxWidth().height(1.dp).background(p.line)) {}
        Spacer(GlanceModifier.height(5.dp))
    }
}

/** Le titre d'une section, en petites capitales : dit ce que les chiffres en dessous annoncent. */
@Composable
fun SectionCaption(text: String, p: Palette) {
    Label(text.uppercase(Locale.FRANCE), 9.sp, p.faint, bold = true)
}

/** « Les 5 autres modèles s'écartent de 0,8 °C… » : le modele retenu n'est jamais dit seul quand il y a la place. */
@Composable
fun SpreadLine(shown: ShownPlace, p: Palette) {
    shown.place.now?.let { Label(WidgetFormat.spread(it), 10.sp, p.ink, maxLines = 4, modifier = GlanceModifier.padding(top = 6.dp)) }
}

/** Les heures a venir en liste, de trois en trois : un seul enfant pour le conteneur parent. Une valeur absente reste un tiret. */
@Composable
fun HoursList(hours: List<WidgetHour>, p: Palette, count: Int = 4, withRain: Boolean = true) {
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        hours.filterIndexed { index, _ -> index % 3 == 2 }.take(count).forEach { hour ->
            Row(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 1.dp)) {
                Label(WidgetFormat.hourLabel(hour.time), 11.sp, p.faint, modifier = GlanceModifier.width(30.dp))
                Label(WidgetFormat.degrees(hour.temperature), 13.sp, p.ink, bold = true, modifier = GlanceModifier.width(36.dp))
                if (withRain) {
                    val rain = WidgetFormat.rain(hour.precipitation)
                    val wet = rain != null && rain != "0"
                    Label(rain?.let { "$it mm" } ?: "–", 11.sp, if (wet) p.rain else p.faint, bold = wet)
                }
            }
        }
    }
}

/** Les jours a venir en colonnes : le jour, l'icone du temps, le maximum, le minimum ; aujourd'hui en relief. */
@Composable
fun DaysStrip(days: List<WidgetForecastDay>, nowMs: Long, p: Palette) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        days.forEachIndexed { index, day ->
            val today = index == 0 && WidgetFormat.dayName(day.date, nowMs) == "auj."
            val column = if (today) GlanceModifier.defaultWeight().background(p.panel).cornerRadius(8.dp) else GlanceModifier.defaultWeight()
            Column(modifier = column.padding(vertical = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Label(WidgetFormat.dayName(day.date, nowMs), 10.sp, if (today) p.ink else p.faint, bold = today)
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

/** Hauteur (dp) a partir de laquelle chaque widget ajoute un bloc : on empile des blocs, jamais du vide. */
object Tiers {
    /** Grand widget : 1 l'essentiel et les jours ; 2 + heures, ecart des modeles, vent ; 3 + courbe et statistiques ; 4 + « Sur 24 h ». */
    fun medium(heightDp: Float): Int =
        when {
            heightDp >= 340f -> 4
            heightDp >= 285f -> 3
            heightDp >= 215f -> 2
            else -> 1
        }

    /** Petit widget : 1 l'essentiel ; 2 + heures a venir ; 3 + jours a venir. */
    fun small(heightDp: Float): Int =
        when {
            heightDp >= 380f -> 3
            heightDp >= 230f -> 2
            else -> 1
        }
}

/** Une ligne « libelle ... valeur » sous un filet : un seul enfant. */
@Composable
private fun StatRow(label: String, value: String, p: Palette) {
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        Box(modifier = GlanceModifier.fillMaxWidth().height(1.dp).background(p.line)) {}
        Row(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 2.dp)) {
            Label(label, 10.sp, p.faint, modifier = GlanceModifier.defaultWeight())
            Label(value, 10.sp, p.ink)
        }
    }
}

/** Vent, rafales, humidite, soleil : jusqu'a `rows` lignes, et seulement celles dont la valeur existe. */
@Composable
fun StatsList(now: WidgetNow?, sun: WidgetSun?, rows: Int, p: Palette) {
    val stats =
        listOfNotNull(
            WidgetFormat.kmh(now?.windSpeed)?.let { "Vent" to it },
            WidgetFormat.kmh(now?.windGust)?.let { "Rafales" to it },
            WidgetFormat.percent(now?.humidity)?.let { "Humidité" to it },
            WidgetFormat.sunSpan(sun)?.let { "Soleil" to it },
        ).take(rows)
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        stats.forEach { (label, value) -> StatRow(label, value, p) }
    }
}

/** Le bloc « Sur 24 h » : etendue, pluie, rafales. */
@Composable
fun Sur24h(day: WidgetDay?, p: Palette) {
    val lines = day?.let { WidgetFormat.dayLines(it) }.orEmpty()
    if (lines.isEmpty()) return
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        SectionCaption("Sur 24 h", p)
        lines.forEach { Label(it, 10.sp, p.ink) }
    }
}

/** Les jours a venir en liste (petit widget haut) : le jour, l'icone, le maximum, le minimum ; aujourd'hui en relief. */
@Composable
fun DaysList(days: List<WidgetForecastDay>, nowMs: Long, p: Palette, withMin: Boolean = true) {
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        days.forEach { day ->
            val today = WidgetFormat.dayName(day.date, nowMs) == "auj."
            val row = if (today) GlanceModifier.fillMaxWidth().background(p.panel).cornerRadius(8.dp) else GlanceModifier.fillMaxWidth()
            Row(modifier = row.padding(vertical = 1.dp, horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Label(WidgetFormat.dayName(day.date, nowMs), 10.sp, if (today) p.ink else p.faint, bold = today, modifier = GlanceModifier.width(28.dp))
                if (WidgetIcons.drawable(day.icon) != null) {
                    WeatherIcon(day.icon, day.label, 18.dp)
                } else {
                    Spacer(GlanceModifier.size(18.dp))
                }
                Spacer(GlanceModifier.width(4.dp))
                Label(WidgetFormat.degrees(day.tempMax), 12.sp, p.ink, bold = true, modifier = GlanceModifier.width(28.dp))
                if (withMin) Label(WidgetFormat.degrees(day.tempMin), 10.sp, p.faint)
            }
        }
    }
}

/** La courbe de 24 h avec sa bande de modeles : la legende, puis l'image dessinee a la taille du bloc. Sans courbe possible, rien. */
@Composable
fun ChartBlock(place: WidgetPlace, widthDp: Float, heightDp: Float, view: WidgetView) {
    val model = remember(place.track) { WidgetChartMath.build(place.track) } ?: return
    val density = view.density
    val bitmap =
        remember(model, widthDp, heightDp, view.colors) {
            WidgetChartRenderer.render(model, (widthDp * density).toInt(), (heightDp * density).toInt(), density, view.colors)
        }
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        SectionCaption(WidgetChartMath.caption(model.runs), view.p)
        Image(
            provider = ImageProvider(bitmap),
            contentDescription = "Température de l’heure en cours aux 24 heures suivantes, avec le modèle de chaque heure",
            modifier = GlanceModifier.fillMaxWidth().height(heightDp.dp),
            contentScale = ContentScale.FillBounds,
        )
    }
}

/**
 * Ce qu'un widget affiche, relu a chaque changement de `WidgetRevision`. Glance ne rappelle pas
 * `provideGlance` quand une session est deja ouverte : une valeur lue avant `provideContent`
 * resterait celle de l'ouverture (choix du lieu ou de l'apparence ignore, contenu ancien).
 */
class WidgetView(
    val shown: ShownPlace?,
    val nowMs: Long,
    val p: Palette,
    val noteIndex: Int,
    val colors: ChartColors,
    val density: Float,
)

@Composable
fun rememberWidgetView(context: Context, appWidgetId: Int): WidgetView {
    val revision by WidgetRevision.value.collectAsState()
    return remember(revision) {
        val choice = WidgetConfig.load(context, appWidgetId)
        val night = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        WidgetView(
            shown = pickPlace(WidgetStore.load(context), choice.placeId),
            nowMs = System.currentTimeMillis(),
            p = paletteOf(choice.theme),
            noteIndex = WidgetConfig.noteIndex(context, appWidgetId),
            colors = WidgetChartRenderer.colorsFor(choice.theme, night),
            density = context.resources.displayMetrics.density,
        )
    }
}

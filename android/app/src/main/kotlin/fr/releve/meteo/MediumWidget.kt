package fr.releve.meteo

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.width

/**
 * Grand widget (4 sur 2) : le bulletin et l'icone du temps a gauche, les jours a venir a droite
 * (les heures a venir quand il n'y a pas de prevision quotidienne). Etire en hauteur, il ajoute
 * l'ecart des autres modeles, les heures et le resume des 24 heures.
 */
class MediumWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(250.dp, 110.dp), DpSize(250.dp, 200.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val choice = WidgetConfig.load(context, GlanceAppWidgetManager(context).getAppWidgetId(id))
        val shown = pickPlace(WidgetStore.load(context), choice.placeId)
        val nowMs = System.currentTimeMillis()
        val p = paletteOf(choice.theme)
        provideContent {
            WidgetFrame(shown?.place?.link.orEmpty(), p) {
                if (shown == null) {
                    SmallText(EMPTY_TEXT, p)
                } else {
                    val roomy = LocalSize.current.height >= ROOMY_HEIGHT
                    val days = shown.place.days
                    Row(modifier = GlanceModifier.fillMaxSize()) {
                        Column(modifier = GlanceModifier.width(112.dp)) {
                            PlaceBlock(shown, nowMs, p, temperatureSize = 28.sp, iconSize = 28.dp, roomy = roomy)
                            if (roomy) {
                                Spacer(GlanceModifier.height(6.dp))
                                SpreadLine(shown, p)
                            }
                        }
                        Spacer(GlanceModifier.width(COLUMN_GAP))
                        Column(modifier = GlanceModifier.defaultWeight()) {
                            if (days.isNotEmpty()) {
                                DaysStrip(days, nowMs, p)
                                Label(WidgetFormat.daysCaption(days), 9.sp, p.faint, italic = true)
                            }
                            // Sans jours a montrer, ou quand il y a la place, les heures a venir.
                            if (days.isEmpty() || roomy) {
                                if (days.isNotEmpty()) Spacer(GlanceModifier.height(4.dp))
                                HoursRow(shown.place.hours, p)
                            }
                            if (roomy) {
                                shown.place.day?.let { WidgetFormat.dayLine(it) }?.let {
                                    Spacer(GlanceModifier.height(3.dp))
                                    Label(it, 10.sp, p.ink, maxLines = 2)
                                }
                            }
                            Spacer(GlanceModifier.height(2.dp))
                            Freshness(shown, nowMs, p)
                        }
                    }
                }
            }
        }
    }
}

/** Les heures a venir, de trois en trois, quatre au plus : l'heure, la temperature, la pluie. Une valeur absente reste un tiret. */
@Composable
private fun HoursRow(hours: List<WidgetHour>, p: Palette) {
    val shown = hours.filterIndexed { index, _ -> index % 3 == 2 }.take(4)
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        shown.forEach { hour ->
            Column(modifier = GlanceModifier.defaultWeight()) {
                Label(WidgetFormat.hourLabel(hour.time), 10.sp, p.faint)
                Label(WidgetFormat.degrees(hour.temperature), 14.sp, p.ink, bold = true)
                val rain = WidgetFormat.rain(hour.precipitation)
                val wet = rain != null && rain != "0"
                Label(rain?.let { "$it mm" } ?: "–", 9.sp, if (wet) p.rain else p.faint, bold = wet)
            }
        }
    }
}

class MediumWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MediumWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetScheduler.start(context)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        WidgetConfig.forget(context, appWidgetIds)
    }
}

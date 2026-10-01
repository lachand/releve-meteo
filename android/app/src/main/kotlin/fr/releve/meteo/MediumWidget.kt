package fr.releve.meteo

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.width

/** Grand widget (4 sur 2) : le bulletin a gauche, les heures a venir et le resume des 24 heures a droite. */
class MediumWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(250.dp, 110.dp), DpSize(250.dp, 200.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val shown = WidgetStore.load(context).firstOrNull()
        val nowMs = System.currentTimeMillis()
        provideContent {
            WidgetFrame(shown?.place?.link.orEmpty()) {
                if (shown == null) {
                    SmallText(EMPTY_TEXT)
                } else {
                    Row(modifier = GlanceModifier.fillMaxSize()) {
                        Column(modifier = GlanceModifier.width(112.dp)) {
                            PlaceBlock(shown, nowMs, temperatureSize = 28.sp)
                            if (LocalSize.current.height >= ROOMY_HEIGHT) {
                                Spacer(GlanceModifier.height(6.dp))
                                SpreadLine(shown)
                            }
                        }
                        Spacer(GlanceModifier.width(COLUMN_GAP))
                        Column(modifier = GlanceModifier.defaultWeight()) {
                            HoursRow(shown.place.hours)
                            shown.place.day?.let { WidgetFormat.dayLine(it) }?.let {
                                Spacer(GlanceModifier.height(3.dp))
                                Label(it, 10.sp, INK, maxLines = 2)
                            }
                            Spacer(GlanceModifier.height(2.dp))
                            Freshness(shown, nowMs)
                        }
                    }
                }
            }
        }
    }
}

/** Les heures a venir, de trois en trois, quatre au plus : l'heure, la temperature, la pluie. Une valeur absente reste un tiret. */
@Composable
private fun HoursRow(hours: List<WidgetHour>) {
    val shown = hours.filterIndexed { index, _ -> index % 3 == 2 }.take(4)
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        shown.forEach { hour ->
            Column(modifier = GlanceModifier.defaultWeight()) {
                Label(WidgetFormat.hourLabel(hour.time), 10.sp, INK_FAINT)
                Label(hour.temperature?.let { "${Math.round(it)}°" } ?: "–", 14.sp, INK, bold = true)
                val rain = WidgetFormat.rain(hour.precipitation)
                val wet = rain != null && rain != "0"
                Label(rain?.let { "$it mm" } ?: "–", 9.sp, if (wet) RAIN else INK_FAINT, bold = wet)
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
}

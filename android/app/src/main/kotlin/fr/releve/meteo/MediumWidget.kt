package fr.releve.meteo

import android.content.Context
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle

/** Grand widget (4 sur 2) : le bulletin, les heures a venir et le resume des 24 heures. */
class MediumWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val shown = WidgetStore.load(context).firstOrNull()
        val nowMs = System.currentTimeMillis()
        provideContent {
            WidgetFrame {
                if (shown == null) {
                    SmallText(EMPTY_TEXT)
                } else {
                    BulletinBlock(shown, nowMs)
                    Spacer(GlanceModifier.height(4.dp))
                    HoursRow(shown.place.hours)
                    shown.place.day?.let { WidgetFormat.dayLine(it) }?.let {
                        Spacer(GlanceModifier.height(4.dp))
                        SmallText(it, faint = false)
                    }
                }
            }
        }
    }
}

/** Une heure sur deux, six au plus : l'heure, la temperature, la pluie. Une valeur absente reste un tiret. */
@androidx.compose.runtime.Composable
private fun HoursRow(hours: List<WidgetHour>) {
    val shown = hours.filterIndexed { index, _ -> index % 2 == 1 }.take(6)
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        shown.forEach { hour ->
            Column(modifier = GlanceModifier.padding(end = 10.dp)) {
                Text(
                    text = WidgetFormat.hourLabel(hour.time),
                    style = TextStyle(color = INK_FAINT, fontSize = 10.sp),
                )
                Text(
                    text = hour.temperature?.let { "${Math.round(it)}°" } ?: "–",
                    style = TextStyle(color = INK, fontSize = 13.sp, fontWeight = FontWeight.Bold),
                )
                Text(
                    text = WidgetFormat.rain(hour.precipitation)?.let { "$it mm" } ?: "–",
                    style = TextStyle(color = INK_FAINT, fontSize = 10.sp),
                )
            }
        }
        Spacer(GlanceModifier.width(0.dp))
    }
}

class MediumWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MediumWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetScheduler.start(context)
    }
}

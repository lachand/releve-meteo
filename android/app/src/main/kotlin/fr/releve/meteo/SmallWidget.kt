package fr.releve.meteo

import android.content.Context
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.LocalSize
import androidx.glance.appwidget.SizeMode
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Spacer
import androidx.glance.layout.height

/** Petit widget (2 sur 2) : le bulletin d'un lieu. */
class SmallWidget : GlanceAppWidget() {
    // Etire en hauteur, le widget montre aussi l'ecart des autres modeles et les heures a venir.
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(110.dp, 110.dp), DpSize(110.dp, 220.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val shown = WidgetStore.load(context).firstOrNull()
        val nowMs = System.currentTimeMillis()
        provideContent {
            WidgetFrame(shown?.place?.link.orEmpty()) {
                if (shown == null) {
                    SmallText(EMPTY_TEXT)
                } else {
                    PlaceBlock(shown, nowMs)
                    if (LocalSize.current.height >= ROOMY_HEIGHT) {
                        Spacer(GlanceModifier.height(6.dp))
                        SpreadLine(shown)
                        Spacer(GlanceModifier.height(6.dp))
                        HoursList(shown.place.hours)
                        shown.place.day?.let { WidgetFormat.dayLine(it) }?.let {
                            Spacer(GlanceModifier.height(6.dp))
                            Label(it, 10.sp, INK, maxLines = 3)
                        }
                    }
                    Spacer(GlanceModifier.height(4.dp))
                    Freshness(shown, nowMs)
                }
            }
        }
    }
}

class SmallWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SmallWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetScheduler.start(context)
    }
}

package fr.releve.meteo

import android.content.Context
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Spacer
import androidx.glance.layout.height

/** Petit widget (2 sur 2) : le bulletin d'un lieu. */
class SmallWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val shown = WidgetStore.load(context).firstOrNull()
        val nowMs = System.currentTimeMillis()
        provideContent {
            WidgetFrame(shown?.place?.link.orEmpty()) {
                if (shown == null) {
                    SmallText(EMPTY_TEXT)
                } else {
                    PlaceBlock(shown, nowMs)
                    Spacer(GlanceModifier.height(2.dp))
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

package fr.releve.meteo

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent

/** Petit widget (2 sur 1) : le bulletin d'un lieu. */
class SmallWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val shown = WidgetStore.load(context).firstOrNull()
        val nowMs = System.currentTimeMillis()
        provideContent {
            WidgetFrame {
                if (shown == null) SmallText(EMPTY_TEXT) else BulletinBlock(shown, nowMs)
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

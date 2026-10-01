package fr.releve.meteo

import android.content.Context
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
import androidx.glance.layout.Spacer
import androidx.glance.layout.height

/** Petit widget (2 sur 2) : le bulletin d'un lieu, avec l'icone du temps. Le lieu et l'apparence se choisissent par widget. */
class SmallWidget : GlanceAppWidget() {
    // Etire en hauteur, le widget montre aussi l'ecart des autres modeles et les heures a venir.
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(110.dp, 110.dp), DpSize(110.dp, 220.dp)))

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
                    PlaceBlock(shown, nowMs, p, roomy = roomy)
                    if (roomy) {
                        Spacer(GlanceModifier.height(6.dp))
                        SpreadLine(shown, p)
                        Divider(p)
                        SectionCaption("Heures à venir", p)
                        HoursList(shown.place.hours, p)
                        shown.place.day?.let { WidgetFormat.dayLine(it) }?.let {
                            Divider(p)
                            Label(it, 10.sp, p.ink, maxLines = 3)
                        }
                    }
                    // Le pied reste en bas, quelle que soit la hauteur donnee au widget.
                    Spacer(GlanceModifier.defaultWeight())
                    Freshness(shown, nowMs, p)
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

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        WidgetConfig.forget(context, appWidgetIds)
    }
}

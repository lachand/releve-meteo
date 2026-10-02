package fr.releve.meteo

import android.content.Context
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

/**
 * Petit widget (2 sur 2 et plus) : le bulletin d'un lieu. On empile des blocs selon la hauteur
 * donnee (voir Tiers) : l'essentiel ; puis les heures a venir ; puis les jours a venir. Jamais
 * d'espace vide a la place d'un bloc : le pied (la ligne intelligente) reste en bas.
 */
class SmallWidget : GlanceAppWidget() {
    // La taille exacte : les blocs et la courbe suivent ce que l'utilisateur donne au widget.
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
        provideContent {
            val view = rememberWidgetView(context, appWidgetId)
            val shown = view.shown
            val nowMs = view.nowMs
            val p = view.p
            val height = LocalSize.current.height.value
            WidgetFrame(shown?.place?.link.orEmpty(), p) {
                if (shown == null) {
                    SmallText(EMPTY_TEXT, p)
                } else {
                    val tier = Tiers.small(height)
                    PlaceBlock(shown, nowMs, p, temperatureSize = 44.sp, iconSize = 28.dp)
                    if (tier >= 2) {
                        Divider(p)
                        SectionCaption("Heures à venir", p)
                        HoursList(shown.place.hours, p, count = if (height >= 230f) 4 else 3)
                    }
                    if (tier >= 3 && shown.place.days.isNotEmpty()) {
                        Divider(p)
                        SectionCaption("Jours à venir", p)
                        DaysList(shown.place.days, nowMs, p)
                    }
                    // Le pied reste en bas, quelle que soit la hauteur donnee au widget.
                    Spacer(GlanceModifier.defaultWeight())
                    Footer(shown, nowMs, p, view.noteIndex, compact = tier == 1)
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

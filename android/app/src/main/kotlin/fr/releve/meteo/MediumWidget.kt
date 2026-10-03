package fr.releve.meteo

import android.content.Context
import androidx.compose.runtime.Composable
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
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.width

/**
 * Grand widget (4 sur 2 et plus) : le bulletin a gauche, les jours a venir a droite. On empile des
 * blocs selon la hauteur donnee (voir Tiers) : l'essentiel et les jours ; puis les heures, l'ecart
 * des modeles et le vent ; puis la courbe de 24 h avec sa bande de modeles et les statistiques ;
 * puis « Sur 24 h ». Jamais d'espace vide a la place d'un bloc.
 */
class MediumWidget : GlanceAppWidget() {
    // La taille exacte : les blocs et la courbe suivent ce que l'utilisateur donne au widget.
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
        provideContent {
            val view = rememberWidgetView(context, appWidgetId)
            val shown = view.shown
            val nowMs = view.nowMs
            val p = view.p
            val size = LocalSize.current
            WidgetFrame(shown?.place?.link.orEmpty(), p) {
                if (shown == null) {
                    SmallText(EMPTY_TEXT, p)
                } else {
                    val tier = Tiers.medium(size.height.value)
                    val days = shown.place.days
                    // La colonne de droite : la largeur moins la marge, les gouttieres et la colonne de gauche.
                    val rightWidth = size.width.value - 150f
                    Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                        Column(modifier = GlanceModifier.width(118.dp)) {
                            PlaceBlock(shown, nowMs, p, temperatureSize = 48.sp, iconSize = 28.dp)
                            if (tier >= 2) {
                                SpreadLine(shown, p)
                                StatsList(shown.place.now, shown.place.sun, rows = if (tier >= 3) 4 else 2, p = p)
                            }
                            if (tier >= 4) {
                                Spacer(GlanceModifier.height(8.dp))
                                Sur24h(shown.place.day, p)
                            }
                        }
                        Spacer(GlanceModifier.width(COLUMN_GAP))
                        Column(modifier = GlanceModifier.defaultWeight()) {
                            if (days.isNotEmpty()) {
                                DaysStrip(days, nowMs, p)
                                if (tier >= 2) Label(WidgetFormat.daysCaption(days), 9.sp, p.faint, italic = true)
                            }
                            // Sans jours a montrer, ou quand il y a la place, les heures a venir.
                            if (days.isEmpty() || tier >= 2) {
                                if (days.isNotEmpty()) Divider(p)
                                if (tier >= 2) SectionCaption("Heures à venir", p)
                                HoursRow(shown.place.hours, p)
                            }
                            if (tier >= 3 && shown.place.track.isNotEmpty()) {
                                Divider(p)
                                ChartBlock(shown.place, rightWidth, if (tier >= 4) 78f else 60f, view)
                            }
                        }
                    }
                    // Le pied reste en bas, sur toute la largeur, quelle que soit la hauteur donnee au widget.
                    Footer(shown, nowMs, p, view.noteIndex, compact = tier == 1)
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

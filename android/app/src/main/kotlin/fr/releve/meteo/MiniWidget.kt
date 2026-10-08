package fr.releve.meteo

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics

/** L'etat vide de la vignette : peu de place, une consigne. */
private const val EMPTY_TEXT_MINI = "Ajoutez un favori dans Relevé"

/**
 * La vignette (1 sur 1) : le lieu, la temperature du moment avec l'icone du temps, et le modele qui
 * la prevoit (en italique : c'est une prevision). Un point rouge dit qu'une alerte est en cours ; un
 * contenu de plus de trois heures grise la temperature et dit son age, a la place du modele ; toucher la
 * zone sous la temperature recalcule alors les widgets. Ailleurs, un appui ouvre le releve du lieu. Ce
 * qu'elle ne peut pas ecrire (la confiance, l'alerte) est dit a l'oreille. La mise en page est decidee
 * par `MiniLayout`.
 */
class MiniWidget : GlanceAppWidget() {
    // La taille exacte : la case donnee par le lanceur varie de 57 a 90 dp.
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
        provideContent {
            val view = rememberWidgetView(context, appWidgetId)
            val size = LocalSize.current
            MiniContent(view, size.width.value, size.height.value)
        }
    }
}

@Composable
private fun MiniContent(view: WidgetView, widthDp: Float, heightDp: Float) {
    val shown = view.shown
    val p = view.p
    val nowMs = view.nowMs
    WidgetFrame(
        link = shown?.place?.link.orEmpty(),
        p = p,
        barWidth = MiniLayout.BAR_DP.dp,
        horizontal = MiniLayout.PADDING_H_DP.dp,
        vertical = MiniLayout.PADDING_V_DP.dp,
        description = if (shown == null) EMPTY_TEXT else WidgetFormat.miniDescription(shown.place, nowMs, shown.generatedAtMs),
    ) {
        if (shown == null) {
            Label(EMPTY_TEXT_MINI, MiniLayout.NAME_SP.sp, p.faint, maxLines = 4)
        } else {
            val place = shown.place
            val now = place.now
            val stale = WidgetFormat.isStale(shown.generatedAtMs, nowMs)
            val alert = place.notes.firstOrNull()?.level == "alert"
            val temperature = WidgetFormat.degrees(now?.temperature)
            val fontScale = LocalContext.current.resources.configuration.fontScale
            val plan =
                MiniLayout.plan(
                    widthDp,
                    heightDp,
                    temperature,
                    hasIcon = WidgetIcons.drawable(now?.icon) != null,
                    alert = alert,
                    fontScale = fontScale,
                )

            if (plan.showName) {
                Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Label(
                        WidgetFormat.fitName(place.name, plan.nameChars),
                        MiniLayout.NAME_SP.sp,
                        p.faint,
                        bold = true,
                        modifier = GlanceModifier.defaultWeight(),
                    )
                    if (alert) Label("●", MiniLayout.NAME_SP.sp, p.margin)
                }
            }
            Spacer(GlanceModifier.defaultWeight())
            Row(verticalAlignment = Alignment.CenterVertically) {
                Label(temperature, plan.temperatureSp.sp, if (stale || now == null) p.faint else p.ink)
                if (plan.showIcon && now != null) {
                    Spacer(GlanceModifier.width(MiniLayout.ICON_GAP_DP.dp))
                    WeatherIcon(now.icon, now.label, plan.iconDp.dp)
                }
            }
            // Un contenu ancien se recalcule en touchant la ligne du bas et le vide au-dessus d'elle (la ligne seule
            // ne fait que 10 dp de haut : une cible trop petite). Pas de colonne a poids autour : elle ne garantit
            // pas sa hauteur a la ligne du bas (le vide se calcule sans elle) et la coupait dans les petites cases.
            val refresh =
                if (stale && now != null) {
                    GlanceModifier.clickable(actionRunCallback<RefreshAction>()).semantics { contentDescription = REFRESH_DESCRIPTION }
                } else {
                    GlanceModifier
                }
            Spacer(GlanceModifier.fillMaxWidth().defaultWeight().then(refresh))
            if (plan.showSource) Row(modifier = GlanceModifier.fillMaxWidth().then(refresh), verticalAlignment = Alignment.CenterVertically) {
                when {
                    // Pas de prevision pour cette heure : rien n'est devine.
                    now == null ->
                        Label("pas de prévision", MiniLayout.MODEL_SP.sp, p.faint, italic = true, maxLines = 2, modifier = GlanceModifier.defaultWeight())
                    // Contenu ancien : son age, en rouge de marge, a la place du modele.
                    stale ->
                        Label(
                            "↻ ${WidgetFormat.ageShort(shown.generatedAtMs, nowMs)}",
                            MiniLayout.MODEL_SP.sp,
                            p.margin,
                            bold = true,
                            modifier = GlanceModifier.defaultWeight(),
                        )
                    // Le modele, en italique : c'est une prevision, pas une mesure.
                    else ->
                        Label(
                            MiniLayout.modelText(now.model, widthDp, dotOnLine = alert && !plan.showName, fontScale = fontScale),
                            MiniLayout.MODEL_SP.sp,
                            p.faint,
                            italic = true,
                            modifier = GlanceModifier.defaultWeight(),
                        )
                }
                // Sans ligne du lieu (case minuscule), le point d'alerte passe sur la ligne du modele.
                if (alert && !plan.showName) Label("●", MiniLayout.NAME_SP.sp, p.margin)
            }
        }
    }
}

/** Ce que le lecteur d'ecran dit de la zone qui recalcule un contenu ancien. */
private const val REFRESH_DESCRIPTION = "Mettre à jour maintenant"

class MiniWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MiniWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetScheduler.start(context)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        WidgetConfig.forget(context, appWidgetIds)
    }
}

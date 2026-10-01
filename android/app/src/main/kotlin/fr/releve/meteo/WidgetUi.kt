package fr.releve.meteo

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.content.Intent
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.FontStyle
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle

/* Les couleurs du carnet (DESIGN.md) : papier et encre, clair et sombre. */
val PAPER = ColorProvider(day = Color(0xFFF2EDE2), night = Color(0xFF131920))
val INK = ColorProvider(day = Color(0xFF1C2733), night = Color(0xFFE8E1D2))
val INK_FAINT = ColorProvider(day = Color(0xFF5B6570), night = Color(0xFFA39A8B))
val MARGIN = ColorProvider(day = Color(0xFFAC4336), night = Color(0xFFE0715F))

/** Le texte de l'etat vide : rien n'est devine, on dit quoi faire. */
const val EMPTY_TEXT = "Ouvrez Relevé et ajoutez un lieu en favori."

@Composable
fun WidgetFrame(content: @Composable () -> Unit) {
    val open = actionStartActivity(Intent(LocalContext.current, MainActivity::class.java))
    Column(
        modifier =
            GlanceModifier
                .fillMaxSize()
                .background(PAPER)
                .padding(8.dp)
                .clickable(open),
    ) {
        content()
    }
}

@Composable
fun SmallText(text: String, faint: Boolean = true, italic: Boolean = false) {
    Text(
        text = text,
        style =
            TextStyle(
                color = if (faint) INK_FAINT else INK,
                fontSize = 11.sp,
                fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
            ),
        maxLines = 2,
    )
}

/** Le bloc commun aux deux tailles : lieu, « modèle prévoit T », confiance, fraicheur. */
@Composable
fun BulletinBlock(shown: ShownPlace, nowMs: Long) {
    val stale = WidgetFormat.isStale(shown.generatedAtMs, nowMs)
    val ink = if (stale) INK_FAINT else INK
    val now = shown.place.now
    Text(
        text = shown.place.name,
        style = TextStyle(color = INK_FAINT, fontSize = 11.sp, fontWeight = FontWeight.Bold),
        maxLines = 1,
    )
    if (now == null) {
        SmallText("Pas de prévision pour cette heure.")
    } else {
        Text(
            text = WidgetFormat.headline(now),
            style = TextStyle(color = ink, fontSize = 15.sp, fontWeight = FontWeight.Bold),
            maxLines = 2,
        )
        // Une prevision, pas une mesure : la provenance est dite.
        SmallText("prévu" + (WidgetFormat.confidence(now)?.let { " · $it" } ?: ""), italic = true)
    }
    SmallText(WidgetFormat.freshness(shown.generatedAtMs, nowMs))
}

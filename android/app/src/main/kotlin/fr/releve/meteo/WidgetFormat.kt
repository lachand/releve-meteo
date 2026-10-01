package fr.releve.meteo

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

/*
 * Les phrases du widget, ecrites a partir du contenu calcule par la page. Ce sont les
 * memes que celles de l'application (briefingPresentation.ts, digestPresentation.ts) :
 * le modele est toujours nomme, l'ecart des autres toujours chiffre, et une donnee
 * ancienne le dit. Aucune decision de selection ici.
 */

object WidgetFormat {
    private const val NBSP = " "
    private val PARIS: ZoneId = ZoneId.of("Europe/Paris")
    private val CLOCK: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm", Locale.FRANCE).withZone(PARIS)

    /** Au-dela, le contenu est dit ancien et grise : jamais presente comme actuel. */
    const val STALE_AFTER_MS: Long = 3L * 60 * 60 * 1000

    private val MODEL_LABELS =
        mapOf(
            "arome" to "AROME",
            "arome_france" to "AROME France",
            "icon_d2" to "ICON-D2",
            "arpege" to "ARPEGE",
            "icon_eu" to "ICON-EU",
            "ecmwf" to "ECMWF",
            "gfs" to "GFS",
        )

    fun modelLabel(id: String): String = MODEL_LABELS[id] ?: id

    private fun oneDecimal(value: Double): String = String.format(Locale.FRANCE, "%.1f", value)

    fun temperature(value: Double): String = "${value.roundToInt()}$NBSP°C"

    fun degreesGap(value: Double): String = "${oneDecimal(value)}$NBSP°C"

    /** « AROME prévoit » : le modèle précède toujours le chiffre, qui s'écrit en grand juste dessous. */
    fun lead(now: WidgetNow): String = "${modelLabel(now.model)} prévoit"

    /** « AROME prévoit 14 °C » : jamais « 14 °C » seul. */
    fun headline(now: WidgetNow): String = "${modelLabel(now.model)} prévoit ${temperature(now.temperature)}"

    fun confidenceWord(confidence: String): String? =
        when (confidence) {
            "high" -> "élevée"
            "medium" -> "moyenne"
            "low" -> "faible"
            else -> null
        }

    /** « confiance élevée », ou null quand aucun verdict n'est possible (terrain inconnu, un seul modèle). */
    fun confidence(now: WidgetNow): String? = confidenceWord(now.confidence)?.let { "confiance $it" }

    /** « Les 5 autres modèles s’en écartent de 0,8 °C en moyenne, au plus 1,6 °C ». */
    fun spread(now: WidgetNow): String {
        val mean = now.meanGap
        val max = now.maxGap
        return when {
            now.others == 0 || mean == null || max == null -> "Aucun autre modèle ne couvre cette heure"
            now.others == 1 -> "L’autre modèle s’en écarte de ${degreesGap(mean)}"
            else -> "Les ${now.others} autres modèles s’en écartent de ${degreesGap(mean)} en moyenne, au plus ${degreesGap(max)}"
        }
    }

    /** « 16h » depuis « 2026-09-28T16:00 ». */
    fun hourLabel(time: String): String = "${time.substring(11, 13).toInt()}h"

    fun rain(mm: Double?): String? =
        when {
            mm == null -> null
            mm < 0.05 -> "0"
            else -> oneDecimal(mm)
        }

    /** « Sur 24 h : de 9 à 18 °C, 2,4 mm de pluie, rafales jusqu’à 47 km/h. », ou null sans rien à dire. */
    fun dayLine(day: WidgetDay): String? {
        val parts = mutableListOf<String>()
        if (day.tempMin != null && day.tempMax != null) {
            parts += "de ${day.tempMin.roundToInt()} à ${day.tempMax.roundToInt()}$NBSP°C"
        }
        if (day.rainMm != null) {
            parts += if (day.rainMm == 0.0) "pas de pluie" else "${oneDecimal(day.rainMm)}${NBSP}mm de pluie"
        }
        if (day.gustMax != null) {
            parts += "rafales jusqu’à ${day.gustMax.roundToInt()}${NBSP}km/h"
        }
        return if (parts.isEmpty()) null else "Sur 24${NBSP}h$NBSP: ${parts.joinToString(", ")}."
    }

    fun isStale(generatedAtMs: Long, nowMs: Long): Boolean = nowMs - generatedAtMs > STALE_AFTER_MS

    /** « mis à jour 15:10 », heure de Paris. */
    fun updatedAt(generatedAtMs: Long): String = "mis à jour ${CLOCK.format(Instant.ofEpochMilli(generatedAtMs))}"

    /** « il y a 5 h » : l'âge d'un contenu ancien. */
    fun age(generatedAtMs: Long, nowMs: Long): String {
        val minutes = ((nowMs - generatedAtMs) / 60_000).coerceAtLeast(0)
        return when {
            minutes < 2 -> "à l’instant"
            minutes < 60 -> "il y a $minutes${NBSP}min"
            else -> "il y a ${minutes / 60}${NBSP}h"
        }
    }

    /** Ligne d'état du bas du widget : la date de mise à jour, ou « ancien » avec son âge. */
    fun freshness(generatedAtMs: Long, nowMs: Long): String =
        if (isStale(generatedAtMs, nowMs)) {
            "ancien : ${updatedAt(generatedAtMs)}, ${age(generatedAtMs, nowMs)}"
        } else {
            updatedAt(generatedAtMs)
        }
}

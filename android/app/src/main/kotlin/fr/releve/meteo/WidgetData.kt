package fr.releve.meteo

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/*
 * Le contenu d'un widget, tel que widget.html le calcule (src/widget/payload.ts) :
 * des donnees, pas des phrases. La selection du modele et la confiance sont
 * calculees par le code TypeScript de la page ; ce module ne fait que les lire.
 */

@Serializable
data class WidgetNow(
    val time: String,
    val model: String,
    val temperature: Double,
    val others: Int,
    val meanGap: Double? = null,
    val maxGap: Double? = null,
    /** "high", "medium", "low" ou "unavailable". */
    val confidence: String,
    val drivers: List<String> = emptyList(),
    /** Pictogramme du temps du moment (choisi par la page), ou null. */
    val icon: String? = null,
    /** « Partiellement nuageux » : le nom du temps, a dire avec l'icone. */
    val label: String? = null,
)

@Serializable
data class WidgetHour(
    val time: String,
    val model: String,
    val temperature: Double? = null,
    val precipitation: Double? = null,
)

@Serializable
data class WidgetDay(
    val tempMin: Double? = null,
    val tempMax: Double? = null,
    val rainMm: Double? = null,
    val gustMax: Double? = null,
)

/** Un jour a venir : le modele retenu ce jour-la, les extremes, la pluie et le temps. */
@Serializable
data class WidgetForecastDay(
    val date: String,
    val model: String,
    val tempMin: Double? = null,
    val tempMax: Double? = null,
    val rainMm: Double? = null,
    val icon: String? = null,
    val label: String? = null,
)

/** Une note de la ligne du pied, choisie et redigee par la page : la plus importante d'abord. */
@Serializable
data class WidgetNote(
    /** "alert", "vigilance", "phenomenon", "rain", "reliability" ou "spread". */
    val kind: String,
    /** "alert" : mise en avant ; "info" sinon. */
    val level: String,
    /** La phrase complete, source dite. */
    val text: String,
    /** Une version courte pour une ligne etroite. */
    val short: String,
)

@Serializable
data class WidgetPlace(
    val id: String,
    val name: String,
    /** Chaine de recherche qui ouvre ce lieu dans l'application, ou vide pour l'ouvrir sans lieu. */
    val link: String = "",
    val now: WidgetNow? = null,
    val hours: List<WidgetHour> = emptyList(),
    val day: WidgetDay? = null,
    val days: List<WidgetForecastDay> = emptyList(),
    val notes: List<WidgetNote> = emptyList(),
)

@Serializable
data class WidgetPayload(
    val version: Int,
    val generatedAtMs: Long,
    val places: List<WidgetPlace> = emptyList(),
    val unreachable: List<String> = emptyList(),
)

/** Un lieu et l'instant de son dernier calcul reussi : un lieu injoignable garde sa derniere valeur, datee. */
@Serializable
data class StoredPlace(val place: WidgetPlace, val generatedAtMs: Long)

@Serializable
data class StoredState(
    val order: List<String> = emptyList(),
    val places: Map<String, StoredPlace> = emptyMap(),
)

/** Version du contenu que ce code sait lire : un contenu d'une autre version est refuse, pas devine. */
const val SUPPORTED_PAYLOAD_VERSION = 1

val WidgetJson = Json { ignoreUnknownKeys = true }

/** Lit un contenu de widget, ou rend null s'il est illisible ou d'une autre version. */
fun parsePayload(json: String): WidgetPayload? =
    try {
        WidgetJson.decodeFromString<WidgetPayload>(json).takeIf { it.version == SUPPORTED_PAYLOAD_VERSION }
    } catch (e: Exception) {
        null
    }

/**
 * Fusionne un nouveau contenu dans l'etat garde : les lieux calcules remplacent les anciens,
 * les lieux injoignables gardent leur derniere valeur et sa date, les lieux qui ne sont plus
 * veilles disparaissent.
 */
fun mergePayload(previous: StoredState, payload: WidgetPayload): StoredState {
    val fresh = payload.places.associate { it.id to StoredPlace(it, payload.generatedAtMs) }
    val kept = payload.unreachable.mapNotNull { id -> previous.places[id]?.let { id to it } }.toMap()
    val order = payload.places.map { it.id } + payload.unreachable.filter { it in kept }
    return StoredState(order = order, places = fresh + kept)
}

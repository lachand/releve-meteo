package fr.releve.meteo

import android.content.Context
import androidx.glance.appwidget.updateAll

/** Ce que le widget montre pour un lieu : son contenu et l'instant de son calcul. */
data class ShownPlace(val place: WidgetPlace, val generatedAtMs: Long)

/** Dernier contenu calcule, garde dans les preferences de l'application. */
object WidgetStore {
    private const val FILE = "releve_widget"
    private const val KEY_STATE = "state"

    private fun readState(context: Context): StoredState {
        val raw = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY_STATE, null)
        return try {
            if (raw == null) StoredState() else WidgetJson.decodeFromString<StoredState>(raw)
        } catch (e: Exception) {
            StoredState()
        }
    }

    /** Enregistre un contenu lu ; rend faux (et ne touche a rien) s'il est illisible ou d'une autre version. */
    fun save(context: Context, payloadJson: String): Boolean {
        val payload = parsePayload(payloadJson) ?: return false
        val merged = mergePayload(readState(context), payload)
        context
            .getSharedPreferences(FILE, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_STATE, WidgetJson.encodeToString(StoredState.serializer(), merged))
            .apply()
        WidgetRevision.bump()
        return true
    }

    fun load(context: Context): List<ShownPlace> {
        val state = readState(context)
        return state.order.mapNotNull { id -> state.places[id]?.let { ShownPlace(it.place, it.generatedAtMs) } }
    }

    suspend fun refreshWidgets(context: Context) {
        SmallWidget().updateAll(context)
        MediumWidget().updateAll(context)
    }
}

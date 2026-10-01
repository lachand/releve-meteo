package fr.releve.meteo

import android.content.Context

/** Apparence choisie pour un widget : suit le telephone, ou clair, ou sombre. */
enum class WidgetTheme(val key: String, val label: String) {
    AUTO("auto", "Automatique (suit le téléphone)"),
    LIGHT("light", "Clair"),
    DARK("dark", "Sombre");

    companion object {
        fun of(key: String?): WidgetTheme = values().firstOrNull { it.key == key } ?: AUTO
    }
}

/** Ce que l'utilisateur a choisi pour un widget : le lieu (null : le premier) et l'apparence. */
data class WidgetChoice(val placeId: String? = null, val theme: WidgetTheme = WidgetTheme.AUTO)

/** Le lieu choisi s'il est toujours calcule, sinon le premier : un widget n'est jamais vide a cause d'un lieu retire. */
fun pickPlace(places: List<ShownPlace>, placeId: String?): ShownPlace? =
    places.firstOrNull { it.place.id == placeId } ?: places.firstOrNull()

/** Choix gardes par widget (identifiant d'instance), dans les preferences de l'application. */
object WidgetConfig {
    private const val FILE = "releve_widget_config"

    private fun prefs(context: Context) = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun load(context: Context, appWidgetId: Int): WidgetChoice {
        val p = prefs(context)
        return WidgetChoice(
            placeId = p.getString("$appWidgetId.place", null),
            theme = WidgetTheme.of(p.getString("$appWidgetId.theme", null)),
        )
    }

    fun save(context: Context, appWidgetId: Int, choice: WidgetChoice) {
        prefs(context)
            .edit()
            .putString("$appWidgetId.place", choice.placeId)
            .putString("$appWidgetId.theme", choice.theme.key)
            .apply()
    }

    fun forget(context: Context, appWidgetIds: IntArray) {
        val editor = prefs(context).edit()
        appWidgetIds.forEach { editor.remove("$it.place").remove("$it.theme") }
        editor.apply()
    }
}

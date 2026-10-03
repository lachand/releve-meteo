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

/** La note suivante, en tournant : « 2/5 » puis « 3/5 »... puis la premiere. Sans note, toujours 0. */
fun nextNoteIndex(index: Int, count: Int): Int = if (count <= 0) 0 else (index + 1) % count

/** La note a montrer : l'indice, ramene dans la liste si elle a change entre-temps. */
fun noteAt(notes: List<WidgetNote>, index: Int): WidgetNote? = if (notes.isEmpty()) null else notes[Math.floorMod(index, notes.size)]

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
        WidgetRevision.bump()
    }

    /** La note montree par un widget : 0 (la plus importante) tant qu'on n'a pas appuye. */
    fun noteIndex(context: Context, appWidgetId: Int): Int = prefs(context).getInt("$appWidgetId.note", 0)

    /** Un appui sur la note : la suivante. */
    fun cycleNote(context: Context, appWidgetId: Int, count: Int) {
        prefs(context).edit().putInt("$appWidgetId.note", nextNoteIndex(noteIndex(context, appWidgetId), count)).apply()
        WidgetRevision.bump()
    }

    /** Un nouveau contenu repart de la note la plus importante, dans tous les widgets. */
    fun resetNotes(context: Context) {
        val p = prefs(context)
        val editor = p.edit()
        p.all.keys.filter { it.endsWith(".note") }.forEach { editor.remove(it) }
        editor.apply()
    }

    fun forget(context: Context, appWidgetIds: IntArray) {
        val editor = prefs(context).edit()
        appWidgetIds.forEach { editor.remove("$it.place").remove("$it.theme").remove("$it.note") }
        editor.apply()
    }
}

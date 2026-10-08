package fr.releve.meteo

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/*
 * La vignette 1 sur 1 : une case de l'ecran d'accueil (57 a 90 dp de cote selon le lanceur). Ce qu'elle
 * montre est decide ici, en Kotlin pur, pour etre teste sans telephone : la taille de la temperature
 * suit la place donnee, et quand la case est trop petite on abandonne d'abord l'icone, puis la ligne du
 * lieu. La ligne du bas n'est jamais abandonnee : elle dit d'ou vient la temperature (le modele, ou
 * l'age d'un contenu ancien).
 */

/** Ce que la vignette montre, pour une taille donnee. */
data class MiniPlan(
    /** Corps de la temperature, en sp. */
    val temperatureSp: Int,
    val showIcon: Boolean,
    val iconDp: Int,
    val showName: Boolean,
    /** Lettres du nom du lieu qui tiennent sur sa ligne. */
    val nameChars: Int,
    /** Toujours vrai : la ligne du bas (le modele, ou l'age d'un contenu ancien) est la provenance de la temperature. */
    val showSource: Boolean = true,
)

object MiniLayout {
    /** Filet rouge de la marge et marges de la feuille, plus serres que sur les autres widgets (dp). */
    const val BAR_DP = 3
    const val PADDING_H_DP = 5
    const val PADDING_V_DP = 4

    /** Corps du nom du lieu et du modele (sp), et de l'icone du temps (dp). */
    const val NAME_SP = 9
    const val MODEL_SP = 8
    const val ICON_DP = 16
    const val ICON_GAP_DP = 3

    private const val DOT_DP = 10f
    private const val MIN_TEMPERATURE_SP = 20f
    private const val ICON_MIN_TEMPERATURE_SP = 22f
    private const val MAX_TEMPERATURE_SP = 34f
    private const val FLOOR_TEMPERATURE_SP = 16f

    /** Hauteur d'une ligne, en multiple du corps ; largeur moyenne d'une capitale grasse, en em. */
    private const val LINE = 1.2f
    private const val NAME_EM = 0.66f

    /** Largeur d'une temperature (« 14° », « -12° », « – »), en em : le chiffre 0,56, le degre 0,40, le signe moins 0,36. */
    fun emWidth(text: String): Float {
        var total = 0f
        for (ch in text) {
            total +=
                when (ch) {
                    '°' -> 0.40f
                    '-' -> 0.36f
                    else -> 0.56f
                }
        }
        return total
    }

    /**
     * La mise en page pour une case de `widthDp` sur `heightDp`. `text` est la temperature telle qu'affichee
     * (« 14° »), `hasIcon` dit si un pictogramme est connu, `alert` si un point rouge doit tenir sur la ligne
     * du lieu. Ordre d'abandon quand la temperature ne tient pas a 22 sp avec son icone, puis a 20 sp :
     * l'icone, puis la ligne du lieu. Jamais la ligne du bas.
     */
    fun plan(widthDp: Float, heightDp: Float, text: String, hasIcon: Boolean, alert: Boolean): MiniPlan {
        val w = widthDp - BAR_DP - 2 * PADDING_H_DP
        val h = heightDp - 2 * PADDING_V_DP
        val nameHeight = NAME_SP * LINE
        val modelHeight = MODEL_SP * LINE
        val em = max(emWidth(text), 0.1f)
        val iconWidth = (ICON_DP + ICON_GAP_DP).toFloat()

        fun fit(availableWidth: Float, availableHeight: Float): Float =
            min(MAX_TEMPERATURE_SP, min(availableWidth / em, availableHeight / LINE))

        var icon = hasIcon
        var size = fit(w - if (icon) iconWidth else 0f, h - nameHeight - modelHeight)
        if (icon && size < ICON_MIN_TEMPERATURE_SP) {
            icon = false
            size = fit(w, h - nameHeight - modelHeight)
        }
        var name = true
        if (size < MIN_TEMPERATURE_SP) {
            name = false
            size = fit(w - if (icon) iconWidth else 0f, h - modelHeight)
        }
        val sp = max(floor(size), FLOOR_TEMPERATURE_SP).toInt()
        val chars = max(floor((w - if (alert && name) DOT_DP else 0f) / (NAME_SP * NAME_EM)).toInt(), 3)
        return MiniPlan(sp, icon, ICON_DP, name, chars)
    }
}

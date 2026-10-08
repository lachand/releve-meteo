package fr.releve.meteo

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/*
 * La vignette 1 sur 1 : une case de l'ecran d'accueil (57 a 90 dp de cote selon le lanceur). Ce qu'elle
 * montre est decide ici, en Kotlin pur, pour etre teste sans telephone : la taille de la temperature
 * suit la place donnee, et quand la case est trop petite on abandonne d'abord l'icone, puis la ligne du
 * lieu. La ligne du bas n'est jamais abandonnee : elle dit d'ou vient la temperature (le modele, ou
 * l'age d'un contenu ancien). Les hauteurs de ligne ont ete mesurees sur les captures de l'emulateur :
 * le texte d'un TextView prend 1,33 fois son corps (marge de police comprise), pas 1,2.
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
    const val PADDING_V_DP = 3

    /** Corps du nom du lieu et du modele (sp), et de l'icone du temps (dp). */
    const val NAME_SP = 9
    const val MODEL_SP = 8
    const val ICON_DP = 16
    const val ICON_GAP_DP = 3

    private const val DOT_DP = 10f
    private const val MIN_TEMPERATURE_SP = 17f
    private const val ICON_MIN_TEMPERATURE_SP = 22f
    private const val MAX_TEMPERATURE_SP = 34f
    private const val FLOOR_TEMPERATURE_SP = 16f
    private const val MAX_FONT_SCALE = 2f

    /**
     * Hauteur d'une ligne, en multiple du corps : 1,33 mesure avec Roboto, 1,4 retenu parce que d'autres
     * polices de telephone sont plus hautes et qu'une ligne du bas coupee est le pire defaut (la provenance
     * disparaitrait). Largeur moyenne d'une capitale grasse, en em.
     */
    private const val LINE = 1.4f
    private const val NAME_EM = 0.66f

    /** Largeur moyenne d'une capitale italique du nom du modele, en em (« AROME » mesure 0,68 em par lettre sur les captures). */
    private const val MODEL_EM = 0.68f

    /**
     * Le nom du modele qui tient sur la ligne du bas : « AROME FR » si la place le permet, sinon « AROME » (le
     * premier mot). Un nom sans espace est rendu tel quel : mieux vaut le voir coupe par « … » que change de nom.
     * `dotOnLine` : le point d'alerte partage la ligne (la ligne du lieu est abandonnee).
     */
    fun modelText(modelId: String, widthDp: Float, dotOnLine: Boolean, fontScale: Float = 1f): String {
        val full = WidgetFormat.modelShort(modelId)
        val scale = fontScale.coerceIn(1f, MAX_FONT_SCALE)
        val available = widthDp - BAR_DP - 2 * PADDING_H_DP - if (dotOnLine) DOT_DP * scale else 0f
        return if (full.length * MODEL_EM * MODEL_SP * scale <= available) full else full.substringBefore(' ')
    }

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
     * du lieu. `fontScale` est la taille de police choisie dans le telephone : les textes sont en sp, donc
     * un texte agrandi prend plus de place que la case ne l'a prevu (en dessous de 1, on garde 1 : on ne
     * promet pas plus de place qu'on n'en a mesure ; au-dela de 2, Android ne va pas).
     *
     * Ordre d'abandon : l'icone part quand elle retient la temperature sous 22 sp et que sans elle la
     * temperature grandit (une case basse, ou l'icone ne coute rien, la garde) ; puis la ligne du lieu,
     * sous 17 sp, si sans elle la temperature grandit, et l'icone est alors rejugee. Jamais la ligne du bas.
     */
    fun plan(widthDp: Float, heightDp: Float, text: String, hasIcon: Boolean, alert: Boolean, fontScale: Float = 1f): MiniPlan {
        val scale = fontScale.coerceIn(1f, MAX_FONT_SCALE)
        val w = widthDp - BAR_DP - 2 * PADDING_H_DP
        val h = heightDp - 2 * PADDING_V_DP
        val nameHeight = NAME_SP * LINE * scale
        val modelHeight = MODEL_SP * LINE * scale
        val em = max(emWidth(text), 0.1f)
        val iconWidth = (ICON_DP + ICON_GAP_DP).toFloat()

        // Le corps (sp) le plus grand dont le texte, grossi par la police du telephone, tient en largeur et en hauteur.
        fun fit(withIcon: Boolean, withName: Boolean): Float {
            val availableWidth = w - if (withIcon) iconWidth else 0f
            val availableHeight = h - modelHeight - if (withName) nameHeight else 0f
            return min(MAX_TEMPERATURE_SP, min(availableWidth / (em * scale), availableHeight / (LINE * scale)))
        }

        var icon = hasIcon
        var name = true
        var size = fit(icon, name)

        fun dropIconIfItHoldsTheTemperatureBack() {
            if (icon && size < ICON_MIN_TEMPERATURE_SP && fit(false, name) > size) {
                icon = false
                size = fit(icon, name)
            }
        }

        dropIconIfItHoldsTheTemperatureBack()
        if (size < MIN_TEMPERATURE_SP && fit(icon, false) > size) {
            name = false
            size = fit(icon, name)
            dropIconIfItHoldsTheTemperatureBack()
        }
        // Le plancher se juge a l'ecran : 16 sp a l'echelle 1 est la meme hauteur que 8 sp a l'echelle 2.
        val sp = max(floor(size), floor(FLOOR_TEMPERATURE_SP / scale)).toInt()
        val chars = max(floor((w - if (alert && name) DOT_DP * scale else 0f) / (NAME_SP * NAME_EM * scale)).toInt(), 3)
        return MiniPlan(sp, icon, ICON_DP, name, chars)
    }
}

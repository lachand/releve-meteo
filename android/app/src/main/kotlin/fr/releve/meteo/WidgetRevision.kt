package fr.releve.meteo

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Compteur de changements (choix d'un widget, nouveau contenu), dans le processus de l'application
 * (recepteurs, travail de fond et ecran de reglage y tournent ensemble). Les widgets le lisent comme
 * un etat : un changement les recompose meme quand Glance garde une session ouverte.
 */
object WidgetRevision {
    private val state = MutableStateFlow(0)
    val value: StateFlow<Int> = state

    fun bump() {
        state.value += 1
    }
}

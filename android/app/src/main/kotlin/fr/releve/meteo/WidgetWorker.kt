package fr.releve.meteo

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout

/**
 * Recalcule le contenu des widgets : charge widget.html sans interface, garde le contenu
 * recu et redessine les widgets. Un echec ne remplace jamais le dernier bon contenu : le
 * widget continue de montrer l'ancien, date, et le dit s'il a plus de trois heures. Quand aucun lieu
 * n'a pu etre calcule (reseau ou source absents), le travail est rejoue avec attente.
 */
class WidgetWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val search = inputData.getString(KEY_SEARCH).orEmpty()
        val json =
            try {
                withTimeout(PAGE_TIMEOUT_MS) { WidgetPage.compute(applicationContext, search) }
            } catch (e: TimeoutCancellationException) {
                return Result.retry()
            } catch (e: WidgetPageException) {
                return Result.retry()
            }
        if (!WidgetStore.save(applicationContext, json)) {
            return Result.failure()
        }
        WidgetStore.refreshWidgets(applicationContext)
        // Les alertes nouvelles, application fermee : meme calcul que les widgets, signale ici.
        Notifier.notify(applicationContext, WidgetStore.load(applicationContext).map { it.place })
        // Le dernier bon contenu reste affiche, date. Mais si aucun lieu n'a pu etre calcule, on
        // reessaie (WorkManager attend de plus en plus longtemps) au lieu d'attendre l'heure suivante.
        return if (parsePayload(json)?.let(::noPlaceComputed) == true) Result.retry() else Result.success()
    }

    companion object {
        const val KEY_SEARCH = "search"

        /** La page doit rendre la main en moins d'une minute : le reste est une panne. */
        const val PAGE_TIMEOUT_MS = 60_000L
    }
}

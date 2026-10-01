package fr.releve.meteo

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Quand recalculer. Android decide du moment exact (economie de batterie, Doze) : le
 * widget ecrit donc toujours l'age de son contenu.
 */
object WidgetScheduler {
    private const val PERIODIC = "widget-periodic"
    private const val NOW = "widget-now"
    private val NETWORK = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** Un calcul toutes les heures, au mieux (le minimum d'Android est de 15 minutes). */
    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<WidgetWorker>(1, TimeUnit.HOURS).setConstraints(NETWORK).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** Un calcul tout de suite : un widget vient d'etre pose, ou les lieux ont change. */
    fun refreshNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<WidgetWorker>().setConstraints(NETWORK).build()
        WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, request)
    }

    fun start(context: Context) {
        schedule(context)
        refreshNow(context)
    }
}

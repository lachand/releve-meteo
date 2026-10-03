package fr.releve.meteo

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** Une alerte a signaler : sa cle de dedoublonnage, le lieu, la phrase (source dite) et le lien du lieu. */
data class AlertToNotify(val key: String, val placeName: String, val text: String, val link: String)

/** Le choix des alertes a signaler, sans Android : le meme avis n'est jamais signale deux fois de suite. */
object NotifyRules {
    /** Les notes de niveau « alert » (regle franchie, vigilance orange ou rouge, phenomene violent) de chaque lieu. */
    fun current(places: List<WidgetPlace>): List<AlertToNotify> =
        places.flatMap { place ->
            place.notes
                .filter { it.level == "alert" }
                .map { AlertToNotify("${place.id}|${it.kind}|${it.short}", place.name, it.text, place.link) }
        }

    /**
     * Les alertes nouvelles depuis le dernier calcul, et les cles a garder en memoire : celles
     * encore en cours. Une alerte qui disparait puis revient est signalee de nouveau.
     */
    fun plan(sent: Set<String>, current: List<AlertToNotify>): Pair<List<AlertToNotify>, Set<String>> =
        current.filter { it.key !in sent } to current.map { it.key }.toSet()
}

/**
 * Les notifications d'alerte, application fermee : le travail horaire des widgets calcule deja
 * les alertes de chaque lieu, il les signale ici. Android choisit le moment du calcul : ce n'est
 * pas du temps reel, et la vigilance officielle reste la reference.
 */
object Notifier {
    private const val FILE = "releve_notify"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_SENT = "sent"
    const val CHANNEL_ID = "alerts"

    fun isEnabled(context: Context): Boolean =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    /** Android 13 et plus demande une autorisation ; avant, seul le reglage du systeme peut tout couper. */
    fun permissionGranted(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** « on » : actif ; « denied » : voulu mais refuse par Android ; « off » : coupe. */
    fun state(context: Context): String =
        when {
            !isEnabled(context) -> "off"
            !permissionGranted(context) || !NotificationManagerCompat.from(context).areNotificationsEnabled() -> "denied"
            else -> "on"
        }

    /** Signale les alertes nouvelles des lieux donnes, si le reglage est actif et l'autorisation accordee. */
    fun notify(context: Context, places: List<WidgetPlace>) {
        if (state(context) != "on") return
        val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        val sent = prefs.getStringSet(KEY_SENT, emptySet()).orEmpty()
        val (fresh, keep) = NotifyRules.plan(sent, NotifyRules.current(places))
        prefs.edit().putStringSet(KEY_SENT, keep).apply()
        if (fresh.isEmpty()) return
        ensureChannel(context)
        val manager = NotificationManagerCompat.from(context)
        fresh.forEach { alert ->
            val open =
                Intent(context, MainActivity::class.java).apply {
                    if (alert.link.isNotEmpty()) data = Uri.parse(WebAssets.APP_URL + alert.link)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
            val tap =
                PendingIntent.getActivity(
                    context,
                    alert.key.hashCode(),
                    open,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                )
            val notification =
                NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_w_cloudy)
                    .setContentTitle(alert.placeName)
                    .setContentText(alert.text)
                    .setStyle(NotificationCompat.BigTextStyle().bigText(alert.text))
                    .setContentIntent(tap)
                    .setAutoCancel(true)
                    .setCategory(NotificationCompat.CATEGORY_STATUS)
                    .build()
            // La permission est verifiee par state() ci-dessus.
            @Suppress("MissingPermission")
            manager.notify(alert.key.hashCode(), notification)
        }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(CHANNEL_ID, "Alertes météo", NotificationManager.IMPORTANCE_DEFAULT)
        channel.description = "Règles d’alerte franchies, vigilance orange ou rouge, phénomènes violents."
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}

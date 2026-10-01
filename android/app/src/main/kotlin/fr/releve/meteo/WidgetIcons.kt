package fr.releve.meteo

/** Le pictogramme choisi par la page (src/widget/icon.ts) vers son dessin ; un nom inconnu n'affiche rien. */
object WidgetIcons {
    fun drawable(name: String?): Int? =
        when (name) {
            "clear" -> R.drawable.ic_w_clear
            "clearNight" -> R.drawable.ic_w_clear_night
            "partly" -> R.drawable.ic_w_partly
            "partlyNight" -> R.drawable.ic_w_partly_night
            "cloudy" -> R.drawable.ic_w_cloudy
            "fog" -> R.drawable.ic_w_fog
            "drizzle" -> R.drawable.ic_w_drizzle
            "rain" -> R.drawable.ic_w_rain
            "snow" -> R.drawable.ic_w_snow
            "thunder" -> R.drawable.ic_w_thunder
            else -> null
        }
}

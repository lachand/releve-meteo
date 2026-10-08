package fr.releve.meteo

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Le reglage d'un widget : le lieu parmi ceux que Relevé calcule (vos favoris), et l'apparence
 * (automatique, clair ou sombre). Il s'ouvre a la pose du widget et a la demande (appui long,
 * puis reglages). Annuler a la pose ne pose pas le widget.
 */
class WidgetConfigActivity : Activity() {
    private val scope = CoroutineScope(Dispatchers.Main)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(RESULT_CANCELED)
        val appWidgetId =
            intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
                ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        val places = WidgetStore.load(this)
        val current = WidgetConfig.load(this, appWidgetId)
        val chosenPlace = pickPlace(places, current.placeId)?.place?.id
        val density = resources.displayMetrics.density
        val pad = (20 * density).toInt()

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        fun heading(title: String) =
            TextView(this).apply {
                text = title
                textSize = 18f
                setPadding(0, (16 * density).toInt(), 0, (4 * density).toInt())
            }
        column.addView(
            TextView(this).apply {
                text = "Réglages du widget"
                textSize = 22f
            },
        )

        column.addView(heading("Lieu"))
        val placeGroup = RadioGroup(this)
        if (places.isEmpty()) {
            column.addView(
                TextView(this).apply {
                    text = "Aucun lieu pour l’instant : ajoutez un favori dans l’application Relevé, puis rouvrez ce réglage."
                },
            )
        } else {
            places.forEach { shown ->
                placeGroup.addView(
                    RadioButton(this).apply {
                        id = View.generateViewId()
                        text = shown.place.name
                        tag = shown.place.id
                        isChecked = shown.place.id == chosenPlace
                    },
                )
            }
            column.addView(placeGroup)
        }

        column.addView(heading("Apparence"))
        val themeGroup = RadioGroup(this)
        WidgetTheme.values().forEach { theme ->
            themeGroup.addView(
                RadioButton(this).apply {
                    id = View.generateViewId()
                    text = theme.label
                    tag = theme.key
                    isChecked = theme == current.theme
                },
            )
        }
        column.addView(themeGroup)

        column.addView(
            Button(this).apply {
                text = "Enregistrer"
                setOnClickListener {
                    isEnabled = false
                    val placeId =
                        if (places.isEmpty()) null
                        else placeGroup.findViewById<RadioButton>(placeGroup.checkedRadioButtonId)?.tag as? String
                    val theme = WidgetTheme.of(themeGroup.findViewById<RadioButton>(themeGroup.checkedRadioButtonId)?.tag as? String)
                    WidgetConfig.save(this@WidgetConfigActivity, appWidgetId, WidgetChoice(placeId, theme))
                    setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
                    scope.launch {
                        WidgetStore.refreshWidgets(applicationContext)
                        finish()
                    }
                }
            },
        )
        setContentView(ScrollView(this).apply { addView(column) })
    }
}

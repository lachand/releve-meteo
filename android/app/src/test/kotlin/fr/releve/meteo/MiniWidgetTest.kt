package fr.releve.meteo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MiniWidgetTest {
    private val nbsp = " "

    private fun plan(width: Float, height: Float, text: String = "14°", icon: Boolean = true, alert: Boolean = false) =
        MiniLayout.plan(width, height, text, hasIcon = icon, alert = alert)

    @Test
    fun aTypicalCellKeepsTheNameTheTemperatureAndTheIcon() {
        val p = plan(72f, 72f)
        assertEquals(26, p.temperatureSp)
        assertTrue(p.showIcon)
        assertTrue(p.showName)
        assertEquals(9, p.nameChars)
    }

    @Test
    fun aBiggerCellGrowsTheTemperatureUpToTheCap() {
        assertEquals(34, plan(90f, 90f).temperatureSp)
        assertEquals(12, plan(90f, 90f).nameChars)
        // Plus haute que large : la largeur limite encore.
        assertEquals(26, plan(72f, 90f).temperatureSp)
    }

    @Test
    fun theSmallestCellDropsTheIconBeforeAnythingElse() {
        val p = plan(57f, 57f)
        assertFalse(p.showIcon)
        assertTrue(p.showName)
        assertEquals(23, p.temperatureSp)
        assertEquals(7, p.nameChars)
    }

    @Test
    fun aShortCellShrinksTheTemperatureBeforeDroppingTheIcon() {
        val p = plan(72f, 57f)
        assertTrue(p.showIcon)
        assertEquals(23, p.temperatureSp)
    }

    @Test
    fun aNegativeTemperatureIsWiderSoTheIconGoesFirst() {
        val p = plan(72f, 72f, text = "-12°")
        assertFalse(p.showIcon)
        assertEquals(31, p.temperatureSp)
        assertEquals(23, plan(57f, 57f, text = "-12°").temperatureSp)
    }

    @Test
    fun aTinyCellDropsThePlaceLineLast() {
        val p = plan(40f, 40f)
        assertFalse(p.showIcon)
        assertFalse(p.showName)
        assertEquals(17, p.temperatureSp)
    }

    @Test
    fun withoutAnIconTheTemperatureTakesTheRoom() {
        assertEquals(34, plan(72f, 72f, icon = false).temperatureSp)
        assertFalse(plan(72f, 72f, icon = false).showIcon)
        // Une valeur absente est un tiret, jamais un zero.
        assertEquals(34, plan(72f, 72f, text = "–", icon = false).temperatureSp)
    }

    @Test
    fun theAlertDotTakesRoomOnThePlaceLine() {
        assertEquals(8, plan(72f, 72f, alert = true).nameChars)
        assertEquals(9, plan(72f, 72f, alert = false).nameChars)
    }

    @Test
    fun theBottomLineIsNeverDroppedWhateverTheSize() {
        // La provenance de la temperature (le modele, ou l'age d'un contenu ancien) : sur toute la grille
        // de tailles, de textes et d'options.
        for (width in 30..130 step 8) {
            for (height in 30..130 step 8) {
                for (text in listOf("14°", "-12°", "8°", "–")) {
                    for (icon in listOf(true, false)) {
                        for (alert in listOf(true, false)) {
                            val p = plan(width.toFloat(), height.toFloat(), text, icon, alert)
                            val where = "${width}x$height $text icone=$icon alerte=$alert"
                            assertTrue(where, p.showSource)
                            assertTrue(where, p.temperatureSp in 16..34)
                            assertTrue(where, p.nameChars >= 3)
                            // Ordre d'abandon : la ligne du lieu ne part qu'apres l'icone.
                            if (!p.showName) assertFalse(where, p.showIcon)
                        }
                    }
                }
            }
        }
    }

    @Test
    fun theTemperatureWidthCountsDigitsDegreeAndMinus() {
        assertEquals(1.52f, MiniLayout.emWidth("14°"), 0.001f)
        assertEquals(1.88f, MiniLayout.emWidth("-12°"), 0.001f)
    }

    @Test
    fun theAgeIsShortAndRoundedDown() {
        val now = 100L * 60 * 60 * 1000
        assertEquals("5${nbsp}h", WidgetFormat.ageShort(now - 5L * 60 * 60 * 1000 - 20 * 60 * 1000, now))
        assertEquals("40${nbsp}min", WidgetFormat.ageShort(now - 40L * 60 * 1000, now))
        assertEquals("2${nbsp}j", WidgetFormat.ageShort(now - 49L * 60 * 60 * 1000, now))
        // Une horloge en retard ne donne jamais un age negatif.
        assertEquals("0${nbsp}min", WidgetFormat.ageShort(now + 60_000, now))
    }

    @Test
    fun thePlaceNameIsUppercasedAndCutWithAnEllipsis() {
        assertEquals("VIRIEU", WidgetFormat.fitName("Virieu", 9))
        assertEquals("SAINT-ÉT…", WidgetFormat.fitName("Saint-Étienne-de-Saint-Geoirs", 9))
        // Une coupe qui finit sur un trait d'union ne le garde pas.
        assertEquals("SAINT…", WidgetFormat.fitName("Saint-Étienne", 7))
        assertEquals("LYON", WidgetFormat.fitName("Lyon", 4))
        assertEquals("L…", WidgetFormat.fitName("Lyon", 1))
    }

    @Test
    fun theModelIsShortenedOnlyWhenItDoesNotFit() {
        assertEquals("AROME FR", WidgetFormat.modelShort("arome_france"))
        assertEquals("AROME", WidgetFormat.modelShort("arome"))
        assertEquals("ICON-D2", WidgetFormat.modelShort("icon_d2"))
        assertEquals("inconnu", WidgetFormat.modelShort("inconnu"))
    }

    private fun place(notes: List<WidgetNote> = emptyList(), now: WidgetNow? = null) =
        WidgetPlace(id = "a", name = "Virieu", now = now, notes = notes)

    private val current = WidgetNow("2026-10-08T15:00", "arome", 14.2, 5, 0.8, 1.6, "high", icon = "cloudy", label = "Couvert")

    @Test
    fun theDescriptionSaysWhatTheTileCannotWrite() {
        val alert = WidgetNote("vigilance", "alert", "Vigilance orange orages (Isère). Source Météo-France.", "Vigilance orange orages")
        assertEquals(
            "Virieu : AROME prévoit 14${nbsp}°C, couvert, confiance élevée. Alerte : Vigilance orange orages.",
            WidgetFormat.miniDescription(place(listOf(alert), current), 1_000L, 1_000L),
        )
        // Une note d'information n'est pas une alerte.
        val info = WidgetNote("rain", "info", "Pluie à 23h.", "Pluie à 23h")
        assertEquals(
            "Virieu : AROME prévoit 14${nbsp}°C, couvert, confiance élevée.",
            WidgetFormat.miniDescription(place(listOf(info), current), 1_000L, 1_000L),
        )
    }

    @Test
    fun theDescriptionSaysWhenTheContentIsOldAndWhenThereIsNoForecast() {
        val hours = 60L * 60 * 1000
        val text = WidgetFormat.miniDescription(place(now = current), 10 * hours, 5 * hours)
        assertTrue(text, text.contains("Contenu ancien : mis à jour"))
        assertTrue(text, text.contains("il y a 5${nbsp}h"))
        assertEquals("Virieu : pas de prévision pour cette heure.", WidgetFormat.miniDescription(place(), 0L, 0L))
    }
}

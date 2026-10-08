package fr.releve.meteo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.floor

class MiniWidgetTest {
    private val nbsp = " "

    private fun plan(width: Float, height: Float, text: String = "14°", icon: Boolean = true, alert: Boolean = false, fontScale: Float = 1f) =
        MiniLayout.plan(width, height, text, hasIcon = icon, alert = alert, fontScale = fontScale)

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
        // L'icone coute de la largeur a la temperature : sans elle, la temperature grandit et la ligne du lieu reste.
        val p = plan(57f, 57f)
        assertFalse(p.showIcon)
        assertTrue(p.showName)
        assertEquals(19, p.temperatureSp)
        assertEquals(7, p.nameChars)
    }

    @Test
    fun aShortCellKeepsTheIconWhenItIsNotWhatLimitsTheTemperature() {
        // Ici la hauteur limite : retirer l'icone ne ferait pas grandir la temperature, elle reste.
        val p = plan(72f, 57f)
        assertTrue(p.showIcon)
        assertTrue(p.showName)
        assertEquals(19, p.temperatureSp)
        // Plus basse encore : la ligne du lieu part, l'icone reste.
        val low = plan(72f, 40f)
        assertTrue(low.showIcon)
        assertFalse(low.showName)
        assertEquals(16, low.temperatureSp)
    }

    @Test
    fun aNegativeTemperatureIsWiderSoTheIconGoesFirst() {
        val p = plan(72f, 72f, text = "-12°")
        assertFalse(p.showIcon)
        assertEquals(30, p.temperatureSp)
        assertEquals(19, plan(57f, 57f, text = "-12°").temperatureSp)
    }

    @Test
    fun aTinyCellDropsThePlaceLineLast() {
        val p = plan(40f, 40f)
        assertFalse(p.showIcon)
        assertFalse(p.showName)
        assertEquals(16, p.temperatureSp)
    }

    @Test
    fun withoutAnIconTheTemperatureTakesTheRoom() {
        assertEquals(30, plan(72f, 72f, icon = false).temperatureSp)
        assertFalse(plan(72f, 72f, icon = false).showIcon)
        // Une valeur absente est un tiret, jamais un zero.
        assertEquals(30, plan(72f, 72f, text = "–", icon = false).temperatureSp)
    }

    @Test
    fun theAlertDotTakesRoomOnThePlaceLine() {
        assertEquals(8, plan(72f, 72f, alert = true).nameChars)
        assertEquals(9, plan(72f, 72f, alert = false).nameChars)
    }

    @Test
    fun aLargerSystemFontShrinksTheTemperatureAndDropsWhatNoLongerFits() {
        // Les textes sont en sp : a 130 %, la place qui suffisait a 100 % ne suffit plus.
        val larger = plan(72f, 72f, fontScale = 1.3f)
        assertEquals(19, larger.temperatureSp)
        assertTrue(larger.showIcon)
        assertTrue(larger.showName)
        assertEquals(7, larger.nameChars)
        // A 200 %, ni la ligne du lieu ni l'icone ne tiennent plus.
        val largest = plan(72f, 72f, fontScale = 2f)
        assertEquals(15, largest.temperatureSp)
        assertFalse(largest.showName)
        assertFalse(largest.showIcon)
        // Une grande case garde tout a 130 %.
        val roomy = plan(90f, 90f, fontScale = 1.3f)
        assertEquals(29, roomy.temperatureSp)
        assertTrue(roomy.showIcon)
        assertTrue(roomy.showName)
    }

    @Test
    fun theSystemFontScaleIsClampedBetweenOneAndTwo() {
        // Une police reduite ne promet pas plus de place qu'on n'en a mesure ; au-dela de 2, Android ne va pas.
        assertEquals(plan(72f, 72f), plan(72f, 72f, fontScale = 0.85f))
        assertEquals(plan(72f, 72f, fontScale = 2f), plan(72f, 72f, fontScale = 3f))
    }

    @Test
    fun theFloorIsJudgedOnScreenNotInSp() {
        // A l'echelle 2, 8 sp font 16 dp a l'ecran : la meme hauteur que le plancher de 16 sp a l'echelle 1.
        assertEquals(10, plan(57f, 57f, fontScale = 2f).temperatureSp)
        assertEquals(8, plan(40f, 40f, text = "-12°", alert = true, fontScale = 2f).temperatureSp)
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
                            for (fontScale in listOf(1f, 1.3f, 2f)) {
                                val p = plan(width.toFloat(), height.toFloat(), text, icon, alert, fontScale)
                                val where = "${width}x$height $text icone=$icon alerte=$alert police=$fontScale"
                                assertTrue(where, p.showSource)
                                assertTrue(where, p.temperatureSp in floor(16f / fontScale).toInt()..34)
                                assertTrue(where, p.nameChars >= 3)
                            }
                        }
                    }
                }
            }
        }
    }

    @Test
    fun theTextsAlwaysFitTheHeightOfTheCell() {
        // Le defaut vu sur les captures : une ligne du bas coupee. Les trois lignes, a 1,33 fois leur corps
        // (hauteur mesuree avec Roboto), tiennent dans toute case qui n'est pas minuscule.
        for (width in 57..130 step 5) {
            for (height in 57..130 step 5) {
                val p = plan(width.toFloat(), height.toFloat())
                val lines = MiniLayout.MODEL_SP + p.temperatureSp + if (p.showName) MiniLayout.NAME_SP else 0
                val needed = lines * 1.33f
                val room = height - 2f * MiniLayout.PADDING_V_DP
                assertTrue("${width}x$height : $needed dp pour $room dp", needed <= room)
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

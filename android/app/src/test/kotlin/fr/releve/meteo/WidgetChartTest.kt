package fr.releve.meteo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetChartTest {
    private fun point(hour: Int, model: String = "arome", t: Double? = 15.0, rain: Double? = 0.0) =
        WidgetTrackPoint("2026-09-28T%02d:00".format(hour), model, t, rain)

    @Test
    fun noCurveWithFewerThanThreeKnownTemperatures() {
        assertNull(WidgetChartMath.build(emptyList()))
        assertNull(WidgetChartMath.build(listOf(point(8), point(9, t = null), point(10))))
    }

    @Test
    fun theAxisCoversTheDataAndNeverFlattensAQuietDay() {
        val wide = WidgetChartMath.build(listOf(point(8, t = 13.4), point(9, t = 21.2), point(10, t = 17.0)))
        assertEquals(13.0, wide!!.min, 0.0)
        assertEquals(22.0, wide.max, 0.0)
        val flat = WidgetChartMath.build(listOf(point(8, t = 15.0), point(9, t = 15.2), point(10, t = 15.1)))
        assertTrue(flat!!.max - flat.min >= 4.0)
        assertTrue(flat.min < 15.0 && flat.max > 15.2)
    }

    @Test
    fun aModelChangeIsARunBoundary() {
        val track = (8..11).map { point(it, "arome") } + (12..14).map { point(it, "icon_eu") }
        val model = WidgetChartMath.build(track)!!
        assertEquals(listOf("arome", "icon_eu"), model.runs.map { it.model })
        assertEquals(listOf(0 to 3, 4 to 6), model.runs.map { it.from to it.to })
        assertEquals("24 H : AROME puis ICON-EU", WidgetChartMath.caption(model.runs))
    }

    @Test
    fun aSingleModelIsNamedOnce() {
        val model = WidgetChartMath.build((8..12).map { point(it) })!!
        assertEquals(1, model.runs.size)
        assertEquals("24 H : AROME", WidgetChartMath.caption(model.runs))
    }

    @Test
    fun aModelThatComesBackIsNamedOnceInTheCaptionButStaysTwoRuns() {
        val track = listOf(point(8, "arome"), point(9, "arome"), point(10, "icon_eu"), point(11, "arome"))
        val model = WidgetChartMath.build(track)!!
        assertEquals(3, model.runs.size)
        assertEquals("24 H : AROME puis ICON-EU", WidgetChartMath.caption(model.runs))
    }

    @Test
    fun missingValuesStayMissing() {
        val track = listOf(point(8, t = 14.0, rain = null), point(9, t = null, rain = 1.5), point(10, t = 16.0), point(11, t = 18.0))
        val model = WidgetChartMath.build(track)!!
        assertNull(model.temps[1])
        assertNull(model.rain[0])
        assertEquals(1.5, model.rain[1]!!, 0.0)
        // La pluie pleine echelle ne descend jamais sous 2 mm par heure : un crachin ne fait pas une barre pleine.
        assertEquals(2.0, model.maxRain, 0.0)
        assertEquals(4, model.hourLabels.size)
        assertEquals("8h", model.hourLabels[0])
    }

    @Test
    fun heavyRainRaisesTheScale() {
        val model = WidgetChartMath.build(listOf(point(8, rain = 6.5), point(9), point(10)))!!
        assertEquals(6.5, model.maxRain, 0.0)
    }

    @Test
    fun theTiersStackBlocksWithTheHeight() {
        assertEquals(1, Tiers.medium(120f))
        assertEquals(2, Tiers.medium(185f))
        assertEquals(3, Tiers.medium(250f))
        assertEquals(4, Tiers.medium(320f))
        assertEquals(1, Tiers.small(120f))
        assertEquals(2, Tiers.small(190f))
        assertEquals(3, Tiers.small(300f))
    }

    @Test
    fun theStatsAreWrittenWithTheirUnitsAndOmitWhatIsMissing() {
        assertEquals("14${nbsp}km/h", WidgetFormat.kmh(14.2))
        assertNull(WidgetFormat.kmh(null))
        assertEquals("82$nbsp%", WidgetFormat.percent(81.6))
        assertNull(WidgetFormat.percent(null))
        assertEquals("7:42 · 19:21", WidgetFormat.sunSpan(WidgetSun("07:42", "19:21")))
        assertNull(WidgetFormat.sunSpan(WidgetSun("07:42", null)))
        assertNull(WidgetFormat.sunSpan(null))
    }

    @Test
    fun theDayBlockWritesOnlyWhatItKnows() {
        assertEquals(
            listOf("De 14 à 21${nbsp}°C", "Pas de pluie", "Rafales jusqu’à 26${nbsp}km/h"),
            WidgetFormat.dayLines(WidgetDay(14.0, 21.0, 0.0, 26.2)),
        )
        assertEquals(listOf("2,4${nbsp}mm de pluie"), WidgetFormat.dayLines(WidgetDay(rainMm = 2.4)))
        assertTrue(WidgetFormat.dayLines(WidgetDay()).isEmpty())
        assertNotNull(WidgetFormat.dayLines(WidgetDay(1.0, 2.0)))
    }

    private val nbsp = "\u00a0"
}

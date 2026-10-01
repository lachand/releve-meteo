package fr.releve.meteo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetFormatTest {
    private val nbsp = " "

    private fun now(
        model: String = "arome",
        temperature: Double = 14.2,
        others: Int = 5,
        mean: Double? = 0.8,
        max: Double? = 1.6,
        confidence: String = "high",
    ) = WidgetNow("2026-09-28T16:00", model, temperature, others, mean, max, confidence)

    @Test
    fun theHeadlineNamesTheModel() {
        assertEquals("AROME prévoit 14${nbsp}°C", WidgetFormat.headline(now()))
        assertEquals("ICON-D2 prévoit 15${nbsp}°C", WidgetFormat.headline(now(model = "icon_d2", temperature = 14.6)))
        assertEquals("inconnu prévoit 14${nbsp}°C", WidgetFormat.headline(now(model = "inconnu")))
    }

    @Test
    fun theConfidenceIsSaidOrLeftOut() {
        assertEquals("confiance élevée", WidgetFormat.confidence(now(confidence = "high")))
        assertEquals("confiance moyenne", WidgetFormat.confidence(now(confidence = "medium")))
        assertEquals("confiance faible", WidgetFormat.confidence(now(confidence = "low")))
        assertNull(WidgetFormat.confidence(now(confidence = "unavailable")))
    }

    @Test
    fun theSpreadIsAlwaysFigured() {
        assertEquals(
            "Les 5 autres modèles s’en écartent de 0,8${nbsp}°C en moyenne, au plus 1,6${nbsp}°C",
            WidgetFormat.spread(now()),
        )
        assertEquals("L’autre modèle s’en écarte de 0,8${nbsp}°C", WidgetFormat.spread(now(others = 1)))
        assertEquals("Aucun autre modèle ne couvre cette heure", WidgetFormat.spread(now(others = 0, mean = null, max = null)))
    }

    @Test
    fun theDayLineOmitsWhatIsMissing() {
        assertEquals(
            "Sur 24${nbsp}h$nbsp: de 9 à 18${nbsp}°C, 2,4${nbsp}mm de pluie, rafales jusqu’à 47${nbsp}km/h.",
            WidgetFormat.dayLine(WidgetDay(9.0, 18.0, 2.4, 47.2)),
        )
        assertEquals("Sur 24${nbsp}h$nbsp: de 9 à 18${nbsp}°C, pas de pluie.", WidgetFormat.dayLine(WidgetDay(9.0, 18.0, 0.0, null)))
        assertNull(WidgetFormat.dayLine(WidgetDay()))
    }

    @Test
    fun anOldContentSaysSoAndNeverPassesForCurrent() {
        val hour = 60L * 60 * 1000
        val generated = 1_790_000_000_000L
        assertFalse(WidgetFormat.isStale(generated, generated + 3 * hour))
        assertTrue(WidgetFormat.isStale(generated, generated + 3 * hour + 1))
        assertTrue(WidgetFormat.freshness(generated, generated + 5 * hour).startsWith("ancien : mis à jour"))
        assertTrue(WidgetFormat.freshness(generated, generated + 5 * hour).endsWith("il y a 5${nbsp}h"))
        assertTrue(WidgetFormat.freshness(generated, generated + 10 * 60 * 1000).startsWith("mis à jour"))
        assertEquals("à l’instant", WidgetFormat.age(generated, generated + 30_000))
        assertEquals("il y a 12${nbsp}min", WidgetFormat.age(generated, generated + 12 * 60_000))
    }

    @Test
    fun theUpdateTimeIsParisTime() {
        // 2026-09-28T13:27:00Z, ete a Paris : 15:27.
        assertEquals("mis à jour 15:27", WidgetFormat.updatedAt(1_790_602_020_000L))
        // 2026-12-01T13:27:00Z, hiver : 14:27.
        assertEquals("mis à jour 14:27", WidgetFormat.updatedAt(1_796_131_620_000L))
    }

    @Test
    fun hoursAndRainAreShortAndAbsentIsNotZero() {
        assertEquals("16h", WidgetFormat.hourLabel("2026-09-28T16:00"))
        assertEquals("7h", WidgetFormat.hourLabel("2026-09-28T07:00"))
        assertEquals("0", WidgetFormat.rain(0.0))
        assertEquals("1,5", WidgetFormat.rain(1.5))
        assertNull(WidgetFormat.rain(null))
    }

    private val sample =
        """
        {"version":1,"generatedAtMs":1790602020000,"unreachable":[],
         "places":[{"id":"lyon","name":"Lyon",
           "now":{"time":"2026-09-28T16:00","model":"icon_d2","temperature":14.2,"others":5,
                  "meanGap":0.8,"maxGap":1.6,"confidence":"high","drivers":[]},
           "hours":[{"time":"2026-09-28T17:00","model":"icon_d2","temperature":13.0,"precipitation":null}],
           "day":{"tempMin":9.0,"tempMax":18.0,"rainMm":2.4,"gustMax":null},
           "futureField":"ignored"}]}
        """.trimIndent()

    @Test
    fun aPayloadIsReadAndUnknownFieldsAreIgnored() {
        val payload = parsePayload(sample)
        assertNotNull(payload)
        assertEquals("lyon", payload!!.places.single().id)
        assertEquals("icon_d2", payload.places.single().now!!.model)
        assertNull(payload.places.single().hours.single().precipitation)
        assertNull(payload.places.single().day!!.gustMax)
    }

    @Test
    fun anUnreadableOrOtherVersionPayloadIsRefused() {
        assertNull(parsePayload("pas du json"))
        assertNull(parsePayload("""{"version":2,"generatedAtMs":1}"""))
        assertNull(parsePayload("""{"generatedAtMs":1}"""))
    }

    @Test
    fun anUnreachablePlaceKeepsItsLastValueWithItsDate() {
        val lyon = WidgetPlace("lyon", "Lyon")
        val brest = WidgetPlace("brest", "Brest")
        val first = mergePayload(StoredState(), WidgetPayload(1, 1_000, listOf(lyon, brest)))
        assertEquals(listOf("lyon", "brest"), first.order)
        // Brest ne repond plus : sa derniere valeur reste, avec sa date.
        val second = mergePayload(first, WidgetPayload(1, 9_000, listOf(lyon), listOf("brest")))
        assertEquals(listOf("lyon", "brest"), second.order)
        assertEquals(9_000, second.places["lyon"]!!.generatedAtMs)
        assertEquals(1_000, second.places["brest"]!!.generatedAtMs)
    }

    @Test
    fun aPlaceNoLongerWatchedDisappearsAndAnUnknownUnreachableOneIsNotInvented() {
        val lyon = WidgetPlace("lyon", "Lyon")
        val first = mergePayload(StoredState(), WidgetPayload(1, 1_000, listOf(lyon)))
        val second = mergePayload(first, WidgetPayload(1, 2_000, emptyList(), listOf("jamais-vu")))
        assertEquals(emptyList<String>(), second.order)
        assertTrue(second.places.isEmpty())
    }

    @Test
    fun mimeTypesCoverTheBuild() {
        assertEquals("text/html", WebAssets.mime("widget.html"))
        assertEquals("text/javascript", WebAssets.mime("assets/main-abc.js"))
        assertEquals("font/woff2", WebAssets.mime("fonts/plex.woff2"))
        assertEquals("application/octet-stream", WebAssets.mime("x.bin"))
    }
}

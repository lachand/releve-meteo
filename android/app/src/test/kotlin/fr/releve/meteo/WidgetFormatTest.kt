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
    fun theNoteCyclesAndComesBackToTheFirst() {
        assertEquals(1, nextNoteIndex(0, 3))
        assertEquals(2, nextNoteIndex(1, 3))
        assertEquals(0, nextNoteIndex(2, 3))
        assertEquals(0, nextNoteIndex(5, 0))
        assertEquals(0, nextNoteIndex(0, 1))
    }

    @Test
    fun theNoteShownIsRebasedWhenTheListChanged() {
        val notes = listOf(WidgetNote("alert", "alert", "A", "a"), WidgetNote("rain", "info", "B", "b"))
        assertEquals("A", noteAt(notes, 0)?.text)
        assertEquals("B", noteAt(notes, 1)?.text)
        assertEquals("A", noteAt(notes, 2)?.text)
        assertEquals("B", noteAt(notes, -1)?.text)
        assertNull(noteAt(emptyList(), 0))
    }

    @Test
    fun theClockIsParisTime() {
        // 2026-09-28 13:07 UTC = 15:07 a Paris (heure d'ete).
        val ms = java.time.ZonedDateTime.of(2026, 9, 28, 13, 7, 0, 0, java.time.ZoneId.of("UTC")).toInstant().toEpochMilli()
        assertEquals("15:07", WidgetFormat.clock(ms))
    }

    @Test
    fun aContentWithNotesStillReadsWithout() {
        val payload =
            parsePayload(
                "{\"version\":1,\"generatedAtMs\":1,\"places\":[{\"id\":\"a\",\"name\":\"Lyon\",\"notes\":[{\"kind\":\"rain\",\"level\":\"info\",\"text\":\"Pluie\",\"short\":\"P\"}]}]}",
            )
        assertEquals("Pluie", payload?.places?.single()?.notes?.single()?.text)
        assertEquals(emptyList<WidgetNote>(), parsePayload("{\"version\":1,\"generatedAtMs\":1,\"places\":[{\"id\":\"a\",\"name\":\"Lyon\"}]}")?.places?.single()?.notes)
    }

    @Test
    fun aRemovedPlaceFallsBackToTheFirst() {
        val a = ShownPlace(WidgetPlace("a", "A"), 1)
        val b = ShownPlace(WidgetPlace("b", "B"), 1)
        assertEquals("b", pickPlace(listOf(a, b), "b")?.place?.id)
        assertEquals("a", pickPlace(listOf(a, b), "gone")?.place?.id)
        assertEquals("a", pickPlace(listOf(a, b), null)?.place?.id)
        assertNull(pickPlace(emptyList(), "a"))
    }

    @Test
    fun anUnknownThemeIsAutomatic() {
        assertEquals(WidgetTheme.DARK, WidgetTheme.of("dark"))
        assertEquals(WidgetTheme.AUTO, WidgetTheme.of("rose"))
        assertEquals(WidgetTheme.AUTO, WidgetTheme.of(null))
    }

    @Test
    fun aMissingDegreeStaysADash() {
        assertEquals("17°", WidgetFormat.degrees(16.6))
        assertEquals("–", WidgetFormat.degrees(null))
        assertEquals("0°", WidgetFormat.degrees(0.2))
    }

    @Test
    fun dayNamesAreFrenchAndTodayIsSaid() {
        // 2026-09-28 12:00 a Paris (lundi).
        val now = java.time.ZonedDateTime.of(2026, 9, 28, 12, 0, 0, 0, java.time.ZoneId.of("Europe/Paris")).toInstant().toEpochMilli()
        assertEquals("auj.", WidgetFormat.dayName("2026-09-28", now))
        assertEquals("mar.", WidgetFormat.dayName("2026-09-29", now))
        assertEquals("jeu.", WidgetFormat.dayName("2026-10-01", now))
    }

    @Test
    fun theDaysCaptionNamesEachModelOnce() {
        val days =
            listOf(
                WidgetForecastDay("2026-09-28", "arome"),
                WidgetForecastDay("2026-09-29", "arome"),
                WidgetForecastDay("2026-09-30", "icon_d2"),
            )
        assertEquals("prévu · AROME, ICON-D2", WidgetFormat.daysCaption(days))
    }

    @Test
    fun theLeadNamesTheModelBeforeTheFigure() {
        assertEquals("AROME prévoit", WidgetFormat.lead(now()))
        assertEquals("ICON-D2 prévoit", WidgetFormat.lead(now(model = "icon_d2")))
    }

    @Test
    fun aContentWithoutLinkStillReads() {
        val old = parsePayload("""{"version":1,"generatedAtMs":1,"places":[{"id":"a","name":"Lyon"}]}""")
        assertEquals("", old?.places?.single()?.link)
        val linked =
            parsePayload(
                """{"version":1,"generatedAtMs":1,"places":[{"id":"a","name":"Lyon","link":"?lat=45.7&lon=4.8&nom=Lyon"}]}""",
            )
        assertEquals("?lat=45.7&lon=4.8&nom=Lyon", linked?.places?.single()?.link)
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

    @Test
    fun theWorkerRetriesOnlyWhenNothingCouldBeComputed() {
        val place = WidgetPlace(id = "a", name = "A")
        // Aucun lieu calcule, un injoignable : le reseau ou la source manquait, on reessaie.
        assertTrue(noPlaceComputed(WidgetPayload(1, 0L, emptyList(), listOf("a"))))
        // Au moins un lieu calcule : le contenu est bon, pas de nouvel essai.
        assertFalse(noPlaceComputed(WidgetPayload(1, 0L, listOf(place), listOf("b"))))
        assertFalse(noPlaceComputed(WidgetPayload(1, 0L, listOf(place), emptyList())))
        // Rien a calculer (aucun lieu veille) : ce n'est pas un echec.
        assertFalse(noPlaceComputed(WidgetPayload(1, 0L, emptyList(), emptyList())))
    }
}

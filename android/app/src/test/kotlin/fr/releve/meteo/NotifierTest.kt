package fr.releve.meteo

import org.junit.Assert.assertEquals
import org.junit.Test

class NotifierTest {
    private fun note(kind: String, level: String, short: String) = WidgetNote(kind, level, "Phrase $short.", short)

    private fun place(id: String, vararg notes: WidgetNote) = WidgetPlace(id = id, name = "Lieu $id", link = "?lat=$id", notes = notes.toList())

    @Test
    fun onlyAlertLevelNotesAreSignalled() {
        val places =
            listOf(
                place("a", note("alert", "alert", "gel"), note("rain", "info", "pluie"), note("vigilance", "alert", "orage")),
                place("b", note("spread", "info", "écart")),
            )
        assertEquals(listOf("a|alert|gel", "a|vigilance|orage"), NotifyRules.current(places).map { it.key })
    }

    @Test
    fun theSameAlertIsNotSignalledTwice() {
        val now = NotifyRules.current(listOf(place("a", note("alert", "alert", "gel"))))
        val (first, kept) = NotifyRules.plan(emptySet(), now)
        assertEquals(1, first.size)
        val (second, _) = NotifyRules.plan(kept, now)
        assertEquals(0, second.size)
    }

    @Test
    fun anAlertThatEndsAndComesBackIsSignalledAgain() {
        val gel = NotifyRules.current(listOf(place("a", note("alert", "alert", "gel"))))
        val (_, kept) = NotifyRules.plan(emptySet(), gel)
        val (_, afterEnd) = NotifyRules.plan(kept, emptyList())
        assertEquals(emptySet<String>(), afterEnd)
        assertEquals(1, NotifyRules.plan(afterEnd, gel).first.size)
    }

    @Test
    fun aNewAlertAtAnotherPlaceIsSignalledAlone() {
        val a = NotifyRules.current(listOf(place("a", note("alert", "alert", "gel"))))
        val (_, kept) = NotifyRules.plan(emptySet(), a)
        val both = a + NotifyRules.current(listOf(place("b", note("alert", "alert", "gel"))))
        assertEquals(listOf("b|alert|gel"), NotifyRules.plan(kept, both).first.map { it.key })
    }
}

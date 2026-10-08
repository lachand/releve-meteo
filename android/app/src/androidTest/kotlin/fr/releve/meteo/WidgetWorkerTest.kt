package fr.releve.meteo

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.workDataOf
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * L'essai de la variante : une WebView sans interface, lancee depuis un travail de
 * WorkManager, charge widget.html embarque, lit la prevision d'Open-Meteo et rend le
 * contenu du widget en quelques secondes. Reseau reel (Open-Meteo), emulateur.
 */
@RunWith(AndroidJUnit4::class)
class WidgetWorkerTest {
    @get:Rule
    val clean = CleanStorage()

    private val context: Context = ApplicationProvider.getApplicationContext()

    private companion object {
        const val MAX_ATTEMPTS = 3
    }

    @Test
    fun theHeadlessPageComputesTheWidgetContent() {
        // Reseau reel : l'emulateur d'une CI ne joint pas toujours Open-Meteo du premier coup (trois
        // essais de 10 s, aucun lieu). Le travail rend alors `retry` et WorkManager le rejouerait : on
        // fait de meme, trois fois au plus, et le dernier essai seul est chronometre.
        var attempts = 0
        var started = 0L
        var result: ListenableWorker.Result = ListenableWorker.Result.retry()
        do {
            attempts += 1
            started = System.currentTimeMillis()
            val worker =
                TestListenableWorkerBuilder<WidgetWorker>(context)
                    .setInputData(workDataOf(WidgetWorker.KEY_SEARCH to "?lat=45.7578&lon=4.832&nom=Lyon&alt=170"))
                    .build()
            result = runBlocking { worker.doWork() }
        } while (result == ListenableWorker.Result.retry() && attempts < MAX_ATTEMPTS)
        val elapsed = System.currentTimeMillis() - started
        println("RELEVE_SPIKE elapsed_ms=$elapsed attempts=$attempts")

        assertEquals(ListenableWorker.Result.success(), result)
        val shown = WidgetStore.load(context)
        assertEquals("lieux calcules apres $attempts essai(s) : l'emulateur a-t-il joint Open-Meteo ?", 1, shown.size)
        val place = shown.single().place
        assertEquals("Lyon", place.name)
        // Le modele retenu est nomme, la temperature est un nombre, les douze heures suivent.
        val now = place.now
        assertNotNull(now)
        assertTrue(WidgetFormat.headline(now!!).contains("prévoit"))
        assertEquals(12, place.hours.size)
        // Les jours a venir : aujourd'hui et les suivants, un modele par jour.
        assertTrue("jours : ${place.days}", place.days.size >= 2)
        // La courbe : une heure par heure, avec le modele de chacune ; le soleil et le vent du moment.
        assertTrue("courbe : ${place.track.size}", place.track.size >= 12)
        assertTrue(place.track.all { it.model.isNotEmpty() })
        assertNotNull(place.sun?.sunrise)
        // Le clic sur le widget ouvre l'application sur ce lieu.
        assertTrue(place.link.startsWith("?lat=45.7578"))
        assertTrue("trop long : $elapsed ms", elapsed < 60_000)
    }
}

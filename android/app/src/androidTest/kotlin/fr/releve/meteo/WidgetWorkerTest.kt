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
import org.junit.Test
import org.junit.runner.RunWith

/**
 * L'essai de la variante : une WebView sans interface, lancee depuis un travail de
 * WorkManager, charge widget.html embarque, lit la prevision d'Open-Meteo et rend le
 * contenu du widget en quelques secondes. Reseau reel (Open-Meteo), emulateur.
 */
@RunWith(AndroidJUnit4::class)
class WidgetWorkerTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun theHeadlessPageComputesTheWidgetContent() {
        val started = System.currentTimeMillis()
        val worker =
            TestListenableWorkerBuilder<WidgetWorker>(context)
                .setInputData(workDataOf(WidgetWorker.KEY_SEARCH to "?lat=45.7578&lon=4.832&nom=Lyon&alt=170"))
                .build()
        val result = runBlocking { worker.doWork() }
        val elapsed = System.currentTimeMillis() - started
        println("RELEVE_SPIKE elapsed_ms=$elapsed")

        assertEquals(ListenableWorker.Result.success(), result)
        val shown = WidgetStore.load(context)
        assertEquals(1, shown.size)
        val place = shown.single().place
        assertEquals("Lyon", place.name)
        // Le modele retenu est nomme, la temperature est un nombre, les douze heures suivent.
        val now = place.now
        assertNotNull(now)
        assertTrue(WidgetFormat.headline(now!!).contains("prévoit"))
        assertEquals(12, place.hours.size)
        assertTrue("trop long : $elapsed ms", elapsed < 60_000)
    }
}

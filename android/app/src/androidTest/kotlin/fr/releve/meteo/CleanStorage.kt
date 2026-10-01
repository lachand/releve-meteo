package fr.releve.meteo

import android.webkit.WebStorage
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.rules.ExternalResource

/**
 * Les deux essais partagent l'origine de l'application, donc son IndexedDB : sans remise a
 * zero, les lieux recopies par l'un deviennent ceux que l'autre croit decouvrir.
 */
class CleanStorage : ExternalResource() {
    override fun before() = wipe()

    override fun after() = wipe()

    private fun wipe() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync { WebStorage.getInstance().deleteAllData() }
    }
}

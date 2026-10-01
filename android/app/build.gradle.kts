plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "fr.releve.meteo"
    compileSdk = 34

    defaultConfig {
        applicationId = "fr.releve.meteo"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets {
        // Le build web (npm run build) est embarque tel quel : l'application et widget.html.
        getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/web"))
    }
}

// Copie dist/ (build web) dans les ressources de l'application. Echoue clairement
// si le build web manque, plutot que de produire une application vide.
val copyWeb by tasks.registering(Copy::class) {
    val dist = rootProject.projectDir.resolve("../dist")
    from(dist)
    into(layout.buildDirectory.dir("generated/web/web"))
    doFirst {
        require(dist.resolve("index.html").exists() && dist.resolve("widget.html").exists()) {
            "dist/ est absent ou incomplet : lancer `npm run build` a la racine du depot."
        }
    }
}
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach {
    dependsOn(copyWeb)
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.glance:glance-appwidget:1.1.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    testImplementation("junit:junit:4.13.2")

    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.work:work-testing:2.9.1")
}

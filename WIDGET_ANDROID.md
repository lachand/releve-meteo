# Widget Android pour Relevé

Statut : **variante adoptée et construite** (APK de test, deux tailles de widget). La première voie essayée (Capacitor et Background Runner) a échoué ; la variante « WebView sans interface lancée par WorkManager » a réussi l'essai sur émulateur. Distribution : APK d'abord, Play Store plus tard.

## Décisions de l'utilisateur

- Le widget se fait, en APK d'abord (Play Store plus tard), en deux tailles.
- On s'arrête si l'essai échoue. Il a échoué une fois (voie Background Runner, ci-dessous), puis réussi (voie WebView).

## Pourquoi pas en PWA

Une PWA n'a pas d'API de widget sur Android. Le navigateur peut installer l'application et lui donner des raccourcis (déjà faits dans `manifest.webmanifest`), mais pas poser une vignette vivante sur l'écran d'accueil. Il faut donc une application Android native qui porte le widget.

## Ce que le widget tient, quoi qu'il arrive

1. **Le modèle est nommé.** « AROME prévoit 14 °C », la confiance, l'écart des autres modèles chiffré, la pastille de provenance (prévu).
2. **Jamais une donnée ancienne présentée comme actuelle.** Chaque widget écrit l'heure de sa dernière mise à jour. Au-delà de trois heures, il se grise et dit « ancien : mis à jour 08:10, il y a 5 h ».
3. **Aucune clé d'API, aucun serveur à nous** : la page lit Open-Meteo directement, comme l'application.
4. **La sélection de modèle est celle de la page.** Elle n'est pas récrite en Kotlin : le widget affiche ce que `src/domain/` a calculé.

## Résultat de l'essai raté : Capacitor et Background Runner (2026-10-01)

`@capacitor/background-runner` 3.0.0 exécute le JavaScript dans QuickJS. J'y ai chargé `src/pwa/watchRun.ts` groupé en un script (100 ko), avec les seules globales annoncées (`console`, `setTimeout`, `fetch`).

- Le script ne se charge pas : `ReferenceError: 'Intl' is not defined`, dès `domain/time.ts`.
- Absents de QuickJS : `Intl`, `URL`, `URLSearchParams`, `AbortController`, `AbortSignal`, `Response`, `Headers`, `structuredClone`, `queueMicrotask`. Le plugin documente un `fetch` réduit et un contexte détruit après chaque appel.
- Notre code s'appuie partout sur ces absents. Les remplacer par des polyfills ferait diverger l'heure de Paris (erreur silencieuse sur l'« heure courante »), ce que la règle 4 interdit. Voie abandonnée.

## Variante adoptée : une WebView sans interface

```
WorkManager (toutes les heures au mieux, et à la demande)
   WidgetWorker crée une WebView sur le fil principal, sans l'afficher
   charge https://appassets.androidplatform.net/widget.html (WebViewAssetLoader, build web embarqué)
        │  même origine que l'application : même IndexedDB, où la page recopie les lieux veillés
        │  Intl, URL, fetch, CORS : un vrai navigateur, rien à réécrire
        ▼
widget.html : runWidget() choisit le modèle comme la page, calcule le contenu
   et appelle ReleveAndroid.publish(json)
        ▼
WidgetStore garde le JSON (SharedPreferences), les widgets Glance se redessinent
```

### Ce qui existe

| Élément                                  | Fichiers                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contenu du widget, TypeScript pur, testé | `src/widget/payload.ts` (`WidgetPayload` v1), `src/widget/run.ts` (`runWidget`, `placeFromSearch`), `src/widget/main.ts`, `widget.html`                                        |
| Pont application vers widgets            | `src/pwa/androidApp.ts`, `useBackgroundWatch.ts` (les favoris sont recopiés dans IndexedDB, puis `ReleveAndroid.refreshWidgets()`)                                             |
| Coque Android                            | `android/` : `MainActivity` (l'application dans une WebView), `WebAssets` (WebViewAssetLoader), `WidgetPage`, `WidgetWorker`, `WidgetScheduler`, `WidgetStore`, `WidgetFormat` |
| Widgets Glance                           | `SmallWidget` (petit, lieu, température et modèle, confiance, mise à jour), `MediumWidget` (moyen, plus les 12 heures suivantes et la phrase « Sur 24 h »)                     |
| Tests                                    | `WidgetFormatTest` (JVM), `WidgetWorkerTest` et `SharedStorageTest` (émulateur), `tests/e2e/widget.spec.ts` et tests unitaires de `src/widget/`                                |
| CI                                       | `.github/workflows/android.yml` : build du web, tests JVM, APK de debug (artefact `releve-debug-apk`), essai sur émulateur API 34                                              |

Lieux du widget : les favoris recopiés par l'application (trois au plus, dans l'ordre). Sans favori, un lieu peut être passé dans l'adresse de la page (essai, premier lancement).

### Ce que l'essai a établi (émulateur API 34, GitHub Actions, réseau réel)

- Une WebView créée dans un worker charge `widget.html` depuis les ressources de l'application, fait le `fetch` Open-Meteo et rend le contenu en **environ 1,3 s**, application fermée. Le contenu porte le modèle nommé et 12 heures.
- Le stockage est partagé : l'application (une WebView) recopie un favori, la page des widgets (une autre WebView, sans paramètre) le relit dans IndexedDB (`SharedStorageTest`). C'était le point dont dépendait toute la variante.
- Les deux essais partagent l'origine : ils remettent le stockage à zéro (`CleanStorage`), sinon les lieux de l'un deviennent ceux de l'autre.

## Limites connues et suite

- **Pas encore essayé sur un appareil réel** : l'émulateur ne dit rien de la batterie, de Doze ni de la fréquence réelle de WorkManager (15 minutes au mieux, une heure demandée). À la charge de l'utilisateur, la première fois.
- **APK de debug seulement** : pas de signature de publication. À faire avec le Play Store (compte, clé de signature conservée, fiche).
- **Choix des lieux** : les favoris, dans l'ordre, sans réglage par widget. Un choix du lieu par widget (écran de configuration) reste à faire.
- **Géolocalisation** : demande minimale dans `MainActivity`.
- **Service worker dans la WebView** : non traité spécifiquement ; la veille par notification reste celle du navigateur.
- **iOS** : hors périmètre (WidgetKit demanderait un autre habillage, un compte payant et un Mac).
- **Quota Open-Meteo** : chaque appareil interroge depuis sa propre adresse, comme la page ; une fois par heure pour trois lieux reste très en dessous des limites gratuites.

## Construire et installer

Depuis l'onglet Actions de GitHub : workflow « Android », artefact `releve-debug-apk`, à installer sur le téléphone (sources inconnues autorisées). En local (JDK 17 et SDK Android) :

```
npm run build
cd android && ./gradlew :app:assembleDebug
```

Le build Gradle recopie `dist/` dans les ressources de l'application. Poser ensuite un widget depuis l'écran d'accueil (Relevé, petit ou moyen), après avoir ajouté un favori dans l'application.

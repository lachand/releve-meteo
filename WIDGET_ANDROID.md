# Plan : un widget Android pour Relevé

Statut : **étape 0 faite le 2026-10-01, elle échoue sur l'architecture approuvée : arrêt**. Rien n'est codé côté Android. Décisions de l'utilisateur : le widget se fait, en APK d'abord (Play Store plus tard), deux tailles, et on s'arrête si l'essai échoue. Voir « Résultat de l'étape 0 » et « Variante à décider ».

## Résultat de l'étape 0 (2026-10-01)

Question : le code que le service worker exécute déjà sans DOM (`watchRun.ts` et `src/domain/`) tourne-t-il dans le moteur du Background Runner de Capacitor ?

Méthode : le plugin (`@capacitor/background-runner` 3.0.0) embarque QuickJS (version du 2025-04-26, vue dans la bibliothèque native). J'ai groupé `src/pwa/watchRun.ts` en un seul script (100 ko) et je l'ai exécuté dans QuickJS (`quickjs-emscripten`) avec les seules globales que le plugin annonce (`console`, `setTimeout`, `fetch`).

Résultats :

- **Le script ne se charge pas** : `ReferenceError: 'Intl' is not defined`, dès `domain/time.ts`, qui convertit l'heure de Paris avec `Intl.DateTimeFormat`.
- Absents de QuickJS : `Intl`, `URL`, `URLSearchParams`, `AbortController`, `AbortSignal`, `Response`, `Headers`, `structuredClone`, `queueMicrotask`. `toLocaleString` ignore le fuseau horaire.
- Le plugin documente un `fetch` réduit (seuls `method`, `headers` et `body`, pas d'objet `Request`), et un contexte détruit après chaque appel (aucun état conservé).
- Notre code s'appuie sur ces absents partout : une dizaine de formes d'`Intl` (heure de Paris, nombres et noms de jours en français), `new URL` dans tous les clients, `AbortSignal.any` dans la couche HTTP, `Response` pour les fichiers compressés.

Verdict : **l'essai échoue**. Le contourner demanderait de réécrire une demi-douzaine de polyfills, dont la conversion de l'heure de Paris, où une erreur silencieuse donnerait une « heure courante » fausse, et un `fetch` dont je ne peux pas tester la forme ici (pas d'émulateur dans l'environnement de développement). Ce serait précisément le risque de divergence que la règle 4 interdit. D'où l'arrêt, comme décidé.

## Variante à décider (non engagée)

Le même principe (une seule logique, en TypeScript) sans le Background Runner : **une WebView sans interface lancée par WorkManager**.

```
WorkManager (toutes les heures, au mieux)
   crée une WebView (fil principal), sans l'afficher
   charge /widget.html depuis les ressources de l'application (WebViewAssetLoader)
        │  même origine que l'application : elle lit le même IndexedDB, où la page recopie déjà les lieux veillés
        │  Intl, URL, fetch, CORS : un vrai navigateur, rien à réécrire
        ▼
widget.html exécute widgetPayload(...) et appelle Android.publish(json)
        ▼
Kotlin écrit le JSON (DataStore) et met à jour les widgets Glance
```

Ce qui change par rapport au plan : pas de Capacitor ni de Background Runner, une coque Android simple (une activité WebView plus le worker). Ce qui reste : `widgetPayload` en TypeScript pur, widgets Glance de deux tailles, règles 1 à 4.

À vérifier avant de s'engager, sur émulateur (GitHub Actions peut en lancer un, pas cet environnement) : qu'une WebView créée dans un worker charge la page, lise l'IndexedDB partagé, fasse le `fetch` et rende la main en quelques secondes, application fermée. Coût et risques propres : une WebView en arrière-plan (mémoire de quelques dizaines de Mo, quelques secondes de calcul), et les limites habituelles d'Android (fréquence, économie de batterie).

## Pourquoi pas en PWA

Une PWA n'a pas d'API de widget sur Android. Le navigateur peut installer l'application et lui donner des raccourcis (déjà faits dans `manifest.webmanifest`), mais pas poser une vignette vivante sur l'écran d'accueil. Les widgets de PWA n'existent que sous Windows (Edge). Il faut donc une application Android native qui porte le widget.

## Ce que le widget doit tenir, quoi qu'il arrive

Ce sont les règles du produit, pas des options :

1. **Le modèle est nommé.** Pas de « 14 °C » seul : « AROME prévoit 14 °C, confiance élevée », avec la pastille de provenance (prévu).
2. **Jamais une donnée ancienne présentée comme actuelle.** Chaque widget écrit l'heure de sa dernière mise à jour. Au-delà de trois heures, il se grise et dit « ancien ».
3. **Aucune clé d'API dans l'application**, aucune donnée envoyée à un serveur à nous : le widget lit Open-Meteo directement, comme la page.
4. **La sélection de modèle est la même que dans la page.** Si le widget choisissait son modèle autrement, il dirait autre chose que l'application : c'est une régression produit.

La quatrième règle décide de tout : la logique de sélection (`src/domain/`, TypeScript pur) ne doit pas être récrite en Kotlin.

## Architecture proposée

**Capacitor** (WebView) autour du build web existant, plus un **plugin natif** et un **widget Glance** (Jetpack, Kotlin).

```
Capacitor Background Runner (JS, sans DOM)
   exécute src/pwa/watchRun.ts + une fonction pure « données du widget »
        │  fetch Open-Meteo, mêmes appels que la page
        ▼
SharedPreferences (JSON : lieu, modèle retenu, température, confiance, 24 h, heure de mise à jour)
        ▼
Widget Glance (Kotlin) : lit le JSON et le dessine, rien d'autre
```

Pourquoi cette forme : `watchRun.ts` et tout `src/domain/` s'exécutent déjà sans DOM (c'est le contrat du service worker). Le Background Runner de Capacitor est un moteur JS sans DOM : le même code y tourne. Le widget ne contient que de l'affichage, donc rien à tenir en double.

Une fonction pure à ajouter côté TypeScript : `widgetPayload({ entry, forecast, now })`, qui réutilise `briefingAt`, `confidenceAt` et `digestBody`, et qui renvoie le JSON ci-dessus (testée à 100 % comme le reste du domaine).

### Contenu des widgets

- **Petit (2 sur 1)** : lieu, température, modèle nommé, confiance, heure de mise à jour.
- **Moyen (4 sur 2)** : le précédent, plus les 12 prochaines heures (température et pluie) et la phrase « Sur 24 h ».

## Alternatives écartées

| Option                                        | Pourquoi pas                                                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TWA (Bubblewrap) seul                         | Même habillage, mais pas de moteur JS en arrière-plan : le widget devrait refaire la sélection en Kotlin.                                                 |
| Widget Kotlin autonome qui appelle Open-Meteo | Double la logique de sélection et de confiance, qui divergerait de la page. Acceptable seulement en repli dégradé, étiqueté « sans sélection » à l'écran. |
| Image générée par la page                     | Le navigateur n'écrit pas dans l'espace d'une autre application.                                                                                          |

## Étapes

| Étape        | Contenu                                                                                                                                  | Sortie                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 0. Essai     | Capacitor + Background Runner : un `fetch` Open-Meteo et le calcul de `digestBody` en arrière-plan, sur un émulateur et un appareil réel | Verdict : le moteur tient-il (durée, fréquence, Doze) ? |
| 1. Coque     | Projet Capacitor qui embarque le build web hors ligne ; l'identifiant d'application reste distinct de la PWA                             | APK qui ouvre Relevé                                    |
| 2. Données   | `widgetPayload` (domaine pur, tests), écriture dans les préférences partagées par le plugin                                              | JSON fiable, âge et lieu inclus                         |
| 3. Widget    | Glance, deux tailles, états : à jour, ancien, sans donnée, aucun lieu choisi                                                             | Widget posé sur l'écran                                 |
| 4. Réglages  | Choix du lieu du widget parmi les favoris, dans l'application                                                                            | Un widget par lieu possible                             |
| 5. Livraison | CI GitHub (SDK Android), signature, APK en publication de dépôt ; Play Store en option                                                   | Fichier installable                                     |

Ordre de grandeur : 2 à 3 semaines de travail, dont l'étape 0 en un à deux jours, qui peut tout arrêter à bon compte.

## Risques

- **Rafraîchissement** : Android limite l'arrière-plan (WorkManager à 15 minutes au mieux, Doze). Le widget affichera parfois une donnée de plusieurs heures : d'où la règle 2.
- **Background Runner** : plugin jeune, à tester avant tout engagement (étape 0).
- **Maintenance** : un second projet (Kotlin, Gradle, SDK Android) à tenir à jour, et une signature à conserver.
- **iOS** : hors périmètre (WidgetKit demanderait un autre habillage, un compte payant et un Mac).
- **Quota Open-Meteo** : chaque appareil interroge depuis sa propre adresse, comme la page ; une fréquence horaire pour trois lieux reste très en dessous des limites gratuites.
- **Tests** : Playwright ne voit pas un widget. Le domaine reste testé en Node ; l'affichage se vérifie à la main sur émulateur.

## Décisions à prendre

1. **Faut-il le faire ?** Le gain est un chiffre sur l'écran d'accueil ; le coût est un second projet à tenir.
2. **Distribution** : fichier APK en publication du dépôt (gratuit, installation manuelle), ou Play Store (compte à 25 dollars, une fois, et revue de Google).
3. **Contenu** : les deux tailles proposées, ou une seule pour commencer.
4. **Repli** : si l'étape 0 échoue, accepter ou non un widget autonome dégradé, étiqueté « sans sélection de modèle » ? Je recommande de s'arrêter plutôt que de montrer une prévision qui ne dit pas pourquoi.

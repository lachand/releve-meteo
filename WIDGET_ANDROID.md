# Widget Android pour Relevé

Statut : **variante adoptée et construite** (APK de test, trois tailles de widget : vignette 1×1, petit et moyen). La première voie essayée (Capacitor et Background Runner) a échoué ; la variante « WebView sans interface lancée par WorkManager » a réussi l'essai sur émulateur. Distribution : APK d'abord, Play Store plus tard.

## Décisions de l'utilisateur

- Le widget se fait, en APK d'abord (Play Store plus tard), en deux tailles.
- On s'arrête si l'essai échoue. Il a échoué une fois (voie Background Runner, ci-dessous), puis réussi (voie WebView).
- Une troisième taille, la vignette 1×1, s'est ajoutée à sa demande (2026-10-08) avec le contenu « Température » (lieu, température, icône, modèle) : voir « La vignette 1×1 ».

## Pourquoi pas en PWA

Une PWA n'a pas d'API de widget sur Android. Le navigateur peut installer l'application et lui donner des raccourcis (déjà faits dans `manifest.webmanifest`), mais pas poser une vignette vivante sur l'écran d'accueil. Il faut donc une application Android native qui porte le widget.

## Ce que le widget tient, quoi qu'il arrive

1. **Le modèle est nommé.** « AROME prévoit 14 °C », la confiance, l'écart des autres modèles chiffré, la pastille de provenance (prévu). Exception documentée : la vignette 1×1 n'a pas la place d'écrire la confiance ni l'écart (voir sa section).
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

| Élément                                  | Fichiers                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contenu du widget, TypeScript pur, testé | `src/widget/payload.ts` (`WidgetPayload` v1), `src/widget/run.ts` (`runWidget`, `placeFromSearch`), `src/widget/main.ts`, `widget.html`                                                                                                                                                                                                 |
| Pont application vers widgets            | `src/pwa/androidApp.ts`, `useBackgroundWatch.ts` (les favoris sont recopiés dans IndexedDB, puis `ReleveAndroid.refreshWidgets()`)                                                                                                                                                                                                      |
| Coque Android                            | `android/` : `MainActivity` (l'application dans une WebView), `WebAssets` (WebViewAssetLoader), `WidgetPage`, `WidgetWorker`, `WidgetScheduler`, `WidgetStore`, `WidgetFormat`                                                                                                                                                          |
| Widgets Glance                           | `MiniWidget` (vignette, 1 sur 1 : lieu, température, icône, modèle ; mise en page décidée par `MiniLayout`), `SmallWidget` (petit, 2 sur 2 : lieu, « AROME prévoit », température en grand, confiance, mise à jour), `MediumWidget` (moyen, 4 sur 2 : le bulletin, puis les heures à venir de trois en trois et la phrase « Sur 24 h ») |
| Tests                                    | `WidgetFormatTest` et `MiniWidgetTest` (JVM), `WidgetWorkerTest`, `SharedStorageTest` et `WidgetScreenshotTest` (émulateur), `tests/e2e/widget.spec.ts` et tests unitaires de `src/widget/`                                                                                                                                             |
| CI                                       | `.github/workflows/android.yml` : build du web, tests JVM, APK de debug (artefact `releve-debug-apk`), essai sur émulateur API 34                                                                                                                                                                                                       |

Chaque widget se règle séparément : à la pose, puis par appui long et « Réglages », un écran propose le **lieu** (parmi les six premiers lieux veillés, vos favoris d'abord) et l'**apparence** (automatique selon le téléphone, clair ou sombre). Le choix est gardé par identifiant de widget ; un lieu retiré des favoris laisse place au premier. Le temps du moment s'affiche par une **icône** (soleil, lune, nuages, brouillard, bruine, pluie, neige, orage) choisie par la page (`src/widget/icon.ts`, d'après le code WMO du modèle retenu) et dessinée en vectoriel ; sans code connu, aucune icône. Le grand widget montre les **jours à venir** (aujourd'hui et trois jours : icône, maximum, minimum), avec le modèle retenu pour chaque jour comme dans la vue « jours » de la page.

**Ligne du pied (« ligne intelligente »)** : la page calcule, pour chaque lieu, des notes classées de la plus importante à la moins importante (`src/widget/notes.ts`) : vos alertes franchies, la vigilance Météo-France orange ou rouge (lue une fois par département), un phénomène violent à venir, la prochaine pluie sur 24 h (ou son absence), la fiabilité du modèle retenu ici (erreur moyenne mesurée sur 30 jours) et la fourchette des modèles. Le widget montre la première, en couleur d'alerte quand c'en est une ; un appui passe à la suivante (« 2/5 ›»), l'heure « ↻ 08:00 » recalcule. Chaque note dit sa source, une note qui ne s'applique pas n'existe pas, et un contenu de plus de trois heures montre d'abord son ancienneté (jamais une donnée ancienne présentée comme actuelle). Un nouveau calcul repart de la note la plus importante. En petite taille, la version courte de la note tient sur une ligne.

**Style « carnet épuré » modulaire.** Le widget n'étire pas une mise en page : il empile des blocs selon la hauteur réellement donnée (`SizeMode.Exact`, paliers dans `Tiers`) et un bloc n'apparaît que s'il tient en entier, donc pas de vide. Grand widget : 1) l'essentiel et les jours ; 2) + les heures, l'écart des modèles, le vent et les rafales ; 3) + la courbe de 24 h avec sa bande de modèles, l'humidité et le soleil ; 4) + « Sur 24 h ». Petit widget : 1) l'essentiel ; 2) + les heures ; 3) + les jours. La courbe est dessinée en image par `WidgetChartRenderer` (température du modèle retenu, pluie en barres, une bande par modèle : le changement de modèle se voit sur la courbe) ; le calcul (`WidgetChartMath`) est testé côté JVM. Vent, rafales, humidité, soleil et la série de 24 heures viennent de la page (`wind*`, `humidity`, `sun`, `track` du contenu) ; une valeur absente n'est pas écrite.

Mise en page : la ligne « ↻ mis à jour 19:42 » reste ancrée en bas du widget et, touchée, recalcule les widgets tout de suite (le reste du widget ouvre l'application sur le lieu). La colonne d'aujourd'hui est en relief dans la bande des jours, des filets et des légendes de section (« Heures à venir ») séparent les blocs quand il y a la place. L'icône d'aujourd'hui dit le temps des heures restantes de la journée (le plus marquant), pas celui du résumé du jour d'un modèle, qui couvre aussi des heures déjà passées.

Les widgets petit et moyen s'adaptent à la taille donnée : étirés en hauteur, ils ajoutent la phrase de l'écart des autres modèles, les heures à venir (petit) et la phrase « Sur 24 h » (petit). Un clic sur un widget ouvre l'application sur le lieu du widget (`link` du contenu, repris par `MainActivity`, y compris application déjà ouverte). Dans l'application, le réglage de veille dit que ce sont les widgets qui rechargent la prévision et propose de les mettre à jour tout de suite.

Lieux du widget : les favoris recopiés par l'application (six au plus, `WIDGET_MAX_PLACES`, dans l'ordre). Sans favori, un lieu peut être passé dans l'adresse de la page (essai, premier lancement).

### La vignette 1×1

Une case de l'écran d'accueil (`MiniWidget`, « Relevé, vignette », taille fixe, sans redimensionnement). Pour un lieu, elle montre :

```
┌──────────────┐
│▌ VIRIEU    ● │   lieu en capitales (coupé par « … » s'il ne tient pas), point rouge si la 1re note est une alerte
│▌ 14°  ☁      │   température du moment, en grand, et icône du temps
│▌ AROME FR    │   modèle en italique : c'est une prévision
└──────────────┘
```

- **Contenu ancien** (plus de trois heures) : la température se grise et « ↻ 5 h » s'écrit en rouge de marge à la place du modèle ; toucher la zone sous la température (pas seulement la ligne, trop mince pour une cible) recalcule les widgets, et le lecteur d'écran l'annonce « Mettre à jour maintenant ». Ailleurs, un appui ouvre le relevé du lieu.
- **États** : sans lieu, « Ajoutez un favori dans Relevé » ; sans prévision pour l'heure, un tiret (« – », jamais un zéro) et « pas de prévision » ; sans icône connue, pas d'icône. Le réglage (lieu, apparence) est celui des autres widgets.
- **Aucun nouveau champ** dans le contenu (v1 inchangé) : tout vient de `now`, `notes` et `generatedAtMs`.
- **Mise en page** (`MiniLayout.plan`, Kotlin pur, testé sans téléphone). Une case mesure en pratique de 57 à 90 dp de côté selon le lanceur. La température prend la plus grande taille qui tient (16 à 34 sp) dans la largeur, chiffres, signe moins et degré comptés séparément, et dans la hauteur que laissent les deux lignes de texte. Quand la case est trop petite, l'icône part si elle retient la température sous 22 sp (une case basse, où l'icône ne coûte rien, la garde), puis la ligne du lieu sous 17 sp ; **jamais la ligne du bas**, qui porte la provenance. Les hauteurs de ligne sont celles mesurées sur les captures de l'émulateur (1,33 fois le corps avec Roboto, 1,4 retenu pour les polices plus hautes) : une première version, qui comptait 1,2, coupait la ligne du bas dans la case de 57 dp. La taille de police choisie dans le téléphone compte (échelle de 1 à 2) : un texte agrandi fait abandonner plus tôt l'icône, puis la ligne du lieu, et le plancher se juge à l'écran (16 sp à l'échelle 1, 8 sp à l'échelle 2). Le test `theBottomLineIsNeverDroppedWhateverTheSize` vérifie le tout sur une grille de tailles, de textes, d'options et d'échelles de police.
- **Écart à la règle 1**, consigné dans `BACKLOG.md` (« Écarts constatés ») : pas la place d'écrire la confiance ni l'écart des autres modèles. La vignette nomme le modèle tant que son contenu est récent, et dit l'âge à sa place quand il est ancien ; la confiance, l'alerte et l'âge sont **dits à l'oreille** : la feuille porte une description (`WidgetFormat.miniDescription`), par exemple « Virieu : AROME prévoit 14 °C, couvert, confiance élevée. Alerte : Vigilance orange orages. ».
- **Limite connue** : les seuils de taille sont réglés d'après les captures de l'émulateur (cases de 57, 72 et 90 dp), pas d'après un lanceur réel. Une capture du téléphone de l'utilisateur les confirmera.

### Ce que l'essai a établi (émulateur API 34, GitHub Actions, réseau réel)

- Une WebView créée dans un worker charge `widget.html` depuis les ressources de l'application, fait le `fetch` Open-Meteo et rend le contenu en **environ 1,3 s**, application fermée. Le contenu porte le modèle nommé et 12 heures.
- Le stockage est partagé : l'application (une WebView) recopie un favori, la page des widgets (une autre WebView, sans paramètre) le relit dans IndexedDB (`SharedStorageTest`). C'était le point dont dépendait toute la variante.
- Les deux essais partagent l'origine : ils remettent le stockage à zéro (`CleanStorage`), sinon les lieux de l'un deviennent ceux de l'autre.

## Pièges Glance rencontrés

- **10 enfants au plus** par `Row`, `Column` ou `Box` : les suivants disparaissent sans erreur (la phrase « Sur 24 h » avait ainsi disparu du grand widget). Chaque bloc de `WidgetUi.kt` est donc un seul enfant (`CHILD_LIMIT`), et un filet n'est pas trois éléments à plat.
- **`provideGlance` n'est pas rappelé** quand une session est déjà ouverte : une valeur lue avant `provideContent` reste celle de l'ouverture. Le lieu, l'apparence et le contenu sont donc relus dans la composition (`rememberWidgetView`), qui se recompose à chaque `WidgetRevision` (choix modifié, nouveau contenu).
- **Mises à jour de l'APK** : le code de version suit le numéro d'exécution de la CI (`GITHUB_RUN_NUMBER`) et la clé de debug est celle du dépôt, pour qu'un APK plus récent s'installe par-dessus le précédent.

## Limites connues et suite

- **Pas encore essayé sur un appareil réel** : l'émulateur ne dit rien de la batterie, de Doze ni de la fréquence réelle de WorkManager (15 minutes au mieux, une heure demandée). À la charge de l'utilisateur, la première fois.
- **APK de debug seulement** : pas de signature de publication. À faire avec le Play Store (compte, clé de signature conservée, fiche).
- **Réglage** : lieu et apparence par widget (fait). Reste : plusieurs lieux sur un même widget.
- **Géolocalisation** : demande minimale dans `MainActivity`.
- **Service worker dans la WebView** : non traité spécifiquement ; la veille du navigateur n'existe pas dans l'application.
- **Notifications natives** : après chaque calcul horaire, `WidgetWorker` signale (`Notifier.kt`) les notes de niveau `alert` (règle franchie, vigilance orange ou rouge, phénomène violent) de chaque lieu veillé, une seule fois par lieu, nature et phrase courte (`NotifyRules`, testé en JVM) ; une alerte qui disparaît puis revient est signalée de nouveau. Réglage explicite dans Réglages (pont `ReleveAndroid.notificationsState` / `setNotifications`), autorisation `POST_NOTIFICATIONS` demandée seulement à l'activation (Android 13 et plus). Un appui ouvre le lieu. Limites dites à l'écran : pas de temps réel (calcul environ horaire, au choix d'Android), la vigilance officielle reste la référence.
- **iOS** : hors périmètre (WidgetKit demanderait un autre habillage, un compte payant et un Mac).
- **Quota Open-Meteo** : chaque appareil interroge depuis sa propre adresse, comme la page ; une fois par heure pour six lieux au plus reste très en dessous des limites gratuites.

## Construire et installer

Sur le téléphone, depuis l'application GitHub : onglet « Releases » du dépôt, pré-publication « APK de test (debug) » (`apk-latest`), appui sur `releve-debug.apk`, puis installation (sources inconnues autorisées pour le navigateur ou le gestionnaire de fichiers). L'APK est signé par une clé de debug fixe du dépôt (`android/app/debug.keystore`, mot de passe standard d'Android : elle n'est pas secrète et n'est pas celle de la publication), pour qu'un nouvel APK s'installe par-dessus le précédent. Les APK construits avant cette clé portent des signatures de passage différentes : Android répond « package en conflit avec un package existant », et il faut désinstaller Relevé une seule fois (les favoris de l'application sont alors perdus, ceux du navigateur ne changent pas). Cette pré-publication est remplacée à chaque envoi qui construit l'APK. Sur ordinateur, l'artefact `releve-debug-apk` du workflow « Android » contient le même fichier, dans un zip. En local (JDK 17 et SDK Android) :

```
npm run build
cd android && ./gradlew :app:assembleDebug
```

Le build Gradle recopie `dist/` dans les ressources de l'application. Poser ensuite un widget depuis l'écran d'accueil (Relevé : vignette, petit ou moyen), après avoir ajouté un favori dans l'application.

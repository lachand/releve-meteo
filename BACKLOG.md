# BACKLOG.md

Chaque lot est livrable et déployable indépendamment. Ne pas démarrer un lot tant que les critères de sortie du précédent ne sont pas remplis.

Cocher les tâches au fur et à mesure. Consigner tout écart en fin de fichier.

---

## Lot 0 : socle technique

- [x] Initialiser Vite, TypeScript `strict` avec `noUncheckedIndexedAccess`
- [x] Configurer ESLint, dont `import/no-restricted-paths` interdisant `domain -> data` et `domain -> ui`
- [x] Configurer Prettier, Vitest avec seuils de couverture, Playwright
- [x] Créer l'arborescence de `ARCHITECTURE.md` section 2, avec fichiers vides
- [x] Écrire `src/domain/constants.ts` et `src/domain/types.ts` en entier
- [x] Écrire `src/ui/styles/tokens.css` depuis `DESIGN.md`
- [x] Auto-héberger les quatre fichiers de police en `woff2`, sous-ensemble latin étendu
- [x] Pipeline CI complet, y compris sur un dépôt sans code applicatif
- [ ] Déploiement statique automatique sur la branche principale (voir Écarts constatés)
- [x] Page « Sources et licences » avec les attributions Open-Meteo, Météo-France, OpenStreetMap

**Sortie** : `npm run verify` passe sur un projet vide. Le déploiement est en ligne.

---

## Lot 1 : prévision de base et cascade

- [x] `domain/time.ts` avec ses tests, dont les deux cas de changement d'heure
- [x] `domain/modelCascade.ts` avec ses tests, toutes les bornes
- [x] `domain/terrain.ts` avec ses tests, plus génération de `coastline-fr.json`
- [x] `data/clients/http.ts` avec `HttpResult`, backoff, tests MSW
- [x] `data/clients/geocoding.ts`, filtré `country_code=FR`
- [x] `data/clients/openMeteo.ts` et `buildForecastUrl`
- [x] `data/mappers/openMeteoMapper.ts`, avec l'invariant de timeline commune
- [x] `data/cache/db.ts`, magasins `forecasts` et `geocoding`, repli mémoire
- [x] `data/queue.ts`, déduplication
- [x] `data/repository.ts`, `getForecast` et `searchPlaces`
- [x] Vérifier les identifiants de modèle Open-Meteo contre la documentation réelle
- [x] UI : recherche de commune, géolocalisation navigateur
- [x] UI : bloc « maintenant » selon `DESIGN.md` 6.1, avec le modèle affiché
- [x] UI : timeline 48 h avec badge de modèle et marqueur de transition
- [x] UI : vue 7 jours
- [x] UI : les quatre états `loading`, `ready`, `empty`, `error`
- [x] Fixtures `nominal-summer`, `arome-truncated`, `dst-spring`, `dst-autumn`

**Sortie** : couverture 100 % sur `src/domain/`. La transition AROME vers ARPEGE est visible à l'écran. Aucun `?? 0` sur une mesure dans tout le dépôt.

---

## Lot 2 : confiance et comparaison

- [x] `domain/confidence.ts` avec ses tests, dont les cas de pénalité terrain
- [x] `domain/derived.ts` avec ses tests
- [x] Encodage de la confiance par texture de trait dans Chart.js
- [x] Bande d'incertitude hachurée, motif SVG diagonal, pas d'aplat translucide (motif Canvas, seul mécanisme de remplissage répété disponible pour un `fill` Chart.js ; rendu diagonal identique, jamais un aplat)
- [x] Panneau latéral « modèle actif » et « confiance » de `DESIGN.md` 6.2
- [x] Mode comparaison de `DESIGN.md` 6.3, avec sa légende propre
- [x] Texte explicatif « pourquoi ce modèle »
- [x] Table de données équivalente accessible pour chaque graphique
- [x] Fixtures `all-dry`, `high-divergence`, `arome-missing`

**Sortie** : la bande d'incertitude s'ouvre visiblement sur `high-divergence` et disparaît sur un cas d'accord. La légende est permanente.

---

## Lot 3 : PWA

Lire `SERVICE_WORKER.md` en entier avant de commencer.

- [x] `manifest.webmanifest` et jeu d'icônes, dont une maskable
- [x] `src/pwa/sw.ts` selon la table de routage, sans Workbox
- [x] Injection de `__BUILD_ID__` au build
- [x] Plugin Vite de génération du manifeste de précache
- [x] `offline.html`
- [x] Cycle de mise à jour avec bandeau et rechargement unique protégé
- [x] `src/pwa/install.ts`, prompt personnalisé via `beforeinstallprompt`
- [x] `ensureStorageHeadroom` et purge
- [x] `navigator.storage.persist()` après le premier favori (fonction prête, site d'appel au lot 5, cf. Écarts constatés)
- [x] SW désactivé en développement, commande `sw:reset`
- [x] Test e2e de régression du service worker, `TESTING.md` 6.5
- [x] Checklist `SERVICE_WORKER.md` 13 exécutée (items 5 et 7 hors périmètre du lot, cf. Écarts constatés)

**Sortie** : deux déploiements successifs vérifiés (`tests/e2e/service-worker.spec.ts`), pas de boucle de rechargement, mode avion fonctionnel pour la coquille applicative, installabilité vérifiée par manifeste + SW actif (`tests/e2e/smoke.spec.ts`) en repli de Lighthouse (cf. Écarts constatés).

---

## Lot 4 : observé contre estimé

- [ ] **Valider empiriquement le CORS d'Infoclimat depuis le navigateur avant toute UI.** Si bloqué, consigner l'écart et livrer uniquement le repli Open-Meteo
- [ ] `data/clients/infoclimat.ts` et son mapper
- [ ] Recherche de station dans un rayon paramétrable, 15 km par défaut
- [ ] Saisie de la clé Infoclimat dans les réglages, stockage local
- [ ] Repli sur `past_days` étiqueté `estimated` si aucune station proche
- [ ] `domain/derived.ts` : `rollingSum` branché sur les cumuls 24 h et 7 j
- [ ] Encodage de la provenance dans l'UI selon `DESIGN.md` 5, pastille pleine et creuse
- [ ] Test transverse d'attribution de provenance, `TESTING.md` 3.4

**Sortie** : aucune valeur affichée sans provenance. Le repli fonctionne sans clé Infoclimat.

---

## Lot 5 : multi-lieux et enrichissements

- [ ] Favoris avec réordonnancement, persistés
- [ ] Alias personnalisés par lieu
- [ ] URL partageable `?lat=&lon=`, avec validation métropole
- [ ] Barre de bascule entre lieux, `DESIGN.md` 6.1 bas d'écran
- [ ] Courbe de pression sur 72 h
- [ ] Point de rosée, risque de gel, risque de brouillard
- [ ] Rose des vents avec direction, sans animation décorative
- [ ] UV, lever et coucher du soleil
- [ ] Réglages : unités, thème, purge des données locales

**Sortie** : bascule entre deux lieux sans rechargement complet, URL partagée fonctionnelle.

---

## Lot 6 : radar et vigilance

- [ ] Carte Leaflet, tuiles OpenStreetMap, attribution conforme
- [ ] Overlay radar RainViewer, cache `tiles` avec expiration 15 min
- [ ] **Valider le CORS de l'API Vigilance avant de construire l'UI.** Si bloqué, masquer proprement la fonctionnalité et consigner
- [ ] Bandeau de vigilance par département, `DESIGN.md` 6.2 haut d'écran
- [ ] Saisie de la clé Vigilance dans les réglages
- [ ] Vérifier que le cache de tuiles survit à un déploiement

**Sortie** : la carte fonctionne hors ligne sur les tuiles déjà visitées. L'absence de clé Vigilance ne casse rien.

---

## Lot 7 : fiabilité locale et alertes

- [ ] `domain/reliability.ts` avec ses tests
- [ ] Magasins `archive` et `reliability` en IndexedDB
- [ ] `archiveForScoring` appelé à chaque récupération de prévision
- [ ] Appariement avec le réalisé via `past_days`, purge à 90 jours
- [ ] Écran de fiabilité, `DESIGN.md` 6.4, avec l'état « en collecte »
- [ ] Mention explicite que le calcul reste sur l'appareil
- [ ] Règles d'alerte : création, édition, activation
- [ ] `detectPushSupport` et adaptation du texte d'interface
- [ ] Évaluation des règles à l'ouverture, mode `foreground-only`
- [ ] Web Push en amélioration progressive, mode `full` uniquement
- [ ] Test de migration IndexedDB préservant l'archive

**Sortie** : sur un appareil iOS, l'interface annonce « alertes à l'ouverture » et ne promet aucune notification en arrière-plan.

---

## Lot 8 : irradiance et solaire, optionnel

- [ ] Saisie de la puissance crête dans les réglages
- [ ] `solarYieldKwh` branché sur `shortwave_radiation`
- [ ] Courbe de production estimée sur 48 h
- [ ] Indicateur « journée favorable au surplus »
- [ ] Mention claire qu'il s'agit d'une estimation sans tenir compte de l'orientation ni des masques

**Sortie** : l'estimation est présentée comme telle, jamais comme une mesure.

---

## Définition de terminé, applicable à chaque lot

- [ ] Fonctionnalités implémentées et vérifiées manuellement
- [ ] Tests unitaires, intégration et e2e correspondants écrits et verts
- [ ] Seuils de couverture respectés
- [ ] CI verte, budgets Lighthouse tenus
- [ ] Quatre états d'interface traités sur tout nouvel écran
- [ ] Navigation clavier et lecteur d'écran vérifiées
- [ ] Captures de régression visuelle mises à jour et relues
- [ ] README mis à jour : ce que le lot ajoute, ce qui ne marche pas encore
- [ ] Aucun `any`, aucun `!` non commenté, aucun `?? 0` sur une mesure

---

## Écarts constatés

Consigner ici toute divergence entre la spécification et la réalité, avec la date et la décision prise.

| Date | Document | Écart | Décision |
|---|---|---|---|
| 2026-08-17 | BACKLOG.md, Lot 0 | Le déploiement automatique sur Cloudflare Pages nécessite de connecter le dépôt GitHub depuis le tableau de bord Cloudflare de l'utilisateur (identifiants hors de portée de l'agent). | Reste une action manuelle ponctuelle pour l'utilisateur : créer un projet Pages, connecter `lachand/releve-meteo`, build `npm run build`, dossier `dist`. Le reste du Lot 0 ne dépend pas de cette étape. |
| 2026-08-17 | AGENTS.md, stack imposée | TypeScript 7 et ESLint 10 (dernières versions publiées) ne sont pas encore supportés par `@typescript-eslint` 8.67 (`peer typescript: >=4.8.4 <6.1.0`) ni par `eslint-plugin-jsx-a11y` 6.10 (`peer eslint: ^3..^9`). | TypeScript fixé à `~6.0.3` et ESLint à `^9.39.5`, les plus récentes versions compatibles avec l'outillage de lint. À relever dans un futur lot quand l'écosystème `typescript-eslint` supportera TS 7. |
| 2026-08-17 | ARCHITECTURE.md §4.2 | `fetchForecast` y est documenté avec un retour `Promise<RawForecastResponse>` non enveloppé, incohérent avec le principe non négociable §4.3 (« aucune exception n'est levée pour un échec réseau »), que respecte tout le reste de la couche données (`request`, `repository.getForecast`). | Implémenté en `Promise<HttpResult<RawForecastResponse>>`, cohérent avec le reste du fichier. Les identifiants de modèle `OPEN_METEO_MODEL_IDS` (§4.1) ont été vérifiés contre l'API réelle le même jour : les quatre valeurs sont exactes. |
| 2026-08-17 | TESTING.md §5, scénario 1 | Le scénario e2e demande de rechercher « Val de Virieu » ; en pratique la géocodification Open-Meteo (filtrée `countryCode=FR`) ne retourne aucun résultat pour cette chaîne exacte, vérifié en direct. Seul « Virieu » (la commune, `admin2: Isère`) est résolu. | `tests/e2e/forecast.spec.ts` recherche « Virieu ». La cascade AROME → ARPEGE avec marqueur de transition est vérifiée visuellement en conditions réelles (captures light/dark, desktop/mobile), y compris une mesure `pressure_msl` réellement `null` chez AROME sur ce point, affichée en tiret et non en 0. |
| 2026-08-17 | ARCHITECTURE.md §3.7, `fogRisk` | Le seuil du niveau `likely` est chiffré (écart < 1 °C et vent < 8 km/h) mais celui de `possible` ne l'est pas, alors que le type de retour l'exige. | Fixé par prudence à écart < 3 °C et vent < 15 km/h dans `derived.ts` (constantes `FOG_POSSIBLE_SPREAD_C` / `FOG_POSSIBLE_WIND_KMH`), testé explicitement. À reconsidérer si une source météorologique de référence est identifiée. |
| 2026-08-17 | `tsconfig.json` racine (Lot 0) | `tsc --noEmit` sur le tsconfig racine « solution » (`files: []` + `references`) est un no-op silencieux sans le flag `-b` : il rend toujours un code de sortie 0 sans rien vérifier, quelle que soit l'erreur de type présente. Découvert au Lot 3 en ajoutant `tsconfig.sw.json`, en testant délibérément avec une erreur de type injectée. Vérifié également que ce défaut préexistait pour `tsconfig.app.json`/`tsconfig.node.json`, donc n'a jamais été spécifique au SW. Révèle au passage une erreur TS5097 préexistante dans `vitest.config.ts` (import `./vite.config.ts` avec extension explicite), jamais détectée jusqu'ici. | `typecheck` et `build` dans `package.json` utilisent désormais `tsc -b`. `vitest.config.ts` importe `./vite.config` sans extension. `*.tsbuildinfo` ajouté à `.gitignore`. Tous les lots précédents doivent être considérés comme n'ayant *jamais* eu de vérification de type automatisée réelle ; aucune régression de type connue n'a cependant été trouvée après la correction (`tsc -b --force` propre sur les trois projets). |
| 2026-08-17 | `package.json`, script `lighthouse` (Lot 0) | `"lighthouse": "lhci autorun"` référence le paquet non scopé `lhci`, jamais installé en dépendance : `npx lhci` résout vers un paquet placeholder sans rapport publié par un tiers (`lhci@4.1.2`, 339 o, « Hello, this is AnupamAS01! »), pas l'outil Lighthouse CI officiel `@lhci/cli`. Executé une fois par erreur au Lot 3 en vérifiant la checklist SERVICE_WORKER.md 13 : contenu inoffensif à ce jour, mais tout script `npm run lighthouse` futur exécutait silencieusement un paquet arbitraire non maîtrisé. | `@lhci/cli@^0.15.1` ajouté en devDependency ; `npx lhci` résout maintenant le vrai binaire local. Le paquet tire des vulnérabilités transitives connues (tmp, uuid, inquirer, puppeteer-core, 7 high / 1 moderate / 2 low), sans correctif amont disponible (`npm audit fix --force` régresserait vers `0.1.0`, non fonctionnel) : accepté tel quel, dépendance de développement uniquement, jamais expédiée dans le bundle applicatif. La configuration complète des budgets (`TESTING.md` 6.4) reste à faire, hors périmètre du Lot 3 ; l'installabilité de ce lot est vérifiée par `tests/e2e/smoke.spec.ts` (manifeste valide, icône maskable, SW enregistré et actif) plutôt que par un run Lighthouse complet. |
| 2026-08-17 | `SERVICE_WORKER.md` §13, item 7 | « Sur iOS, la section d'alertes affiche bien le mode « à l'ouverture » » suppose que les alertes (`detectPushSupport`, écran de fiabilité) existent déjà, alors qu'elles sont explicitement prévues au Lot 7. | Item non exécutable au Lot 3 par construction ; à revérifier lors de l'exécution de cette même checklist au Lot 7, moment où la fonctionnalité qu'il vérifie existera. |
| 2026-08-17 | `TESTING.md` §5, scénario 4 | « Basculer hors ligne, recharger, le contenu s'affiche avec l'horodatage » suppose qu'un rechargement complet retrouve le lieu précédemment consulté. `place` n'est que de l'état React local dans `App.tsx` : un rechargement repart sur `Aucun lieu enregistré`, quel que soit l'état réseau. Le repli `stale:true` de `data/repository.ts` et le bandeau `staleBanner` existent et sont déjà testés unitairement (`repository.test.ts`), mais le scénario e2e complet (reload → même lieu → contenu périmé visible) n'est pas automatisable avant qu'un mécanisme de persistance du lieu (URL partagée ou favori) existe. | Non traité au Lot 3, qui livre le chargement hors ligne de la coquille applicative elle-même (`tests/e2e/smoke.spec.ts`, `tests/e2e/service-worker.spec.ts`) : c'est la responsabilité propre de ce lot. Le scénario 5.4 complet est naturellement débloqué par `?lat=&lon=` (scénario 5.5) ou les favoris (Lot 5) ; à reprendre à ce moment-là plutôt que de forcer un test fragile aujourd'hui. |

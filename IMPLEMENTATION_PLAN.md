# IMPLEMENTATION_PLAN.md

Séquencement détaillé de construction, complémentaire à [BACKLOG.md](BACKLOG.md).
BACKLOG.md dit *quoi* faire et *quand un lot est fini*. Ce document dit *dans
quel ordre* construire à l'intérieur de chaque lot, *quelles décisions*
trancher avant de commencer, et *quelles dépendances* existent entre lots
au-delà de leur numérotation.

Ne pas cocher ce document : le suivi d'avancement reste dans BACKLOG.md. Les
écarts constatés pendant la construction se consignent dans la section dédiée
de BACKLOG.md, pas ici.

---

## 1. Principe de séquencement

Dans chaque lot : `domain/` avant `data/` avant `ui/`, tests avant
implémentation pour tout ce qui touche `domain/` (règle AGENTS.md §Protocole
de travail). Un lot n'est démarré que si le lot précédent remplit ses
critères de sortie, `npm run verify` compris.

Deux types de tâches échappent à l'ordre strict domain → data → ui à
l'intérieur d'un lot et sont signalées explicitement plus bas :

- les **fixtures** de test, qui doivent exister *avant* les tests
  d'intégration qui les consomment, pas en fin de lot comme le laisse
  supposer leur position dans les listes à cocher de BACKLOG.md ;
- les **spikes de validation externe** (CORS Infoclimat, CORS Vigilance,
  identifiants de modèle Open-Meteo), qui doivent être menés avant d'écrire
  la moindre UI qui en dépend, parce qu'un blocage change le périmètre livrable
  du lot.

---

## 2. Décisions à trancher avant le Lot 0

Ces points ne sont fixés par aucun des documents existants. Les laisser
ouverts bloque la sortie du Lot 0.

| # | Décision | Recommandation | Pourquoi |
|---|---|---|---|
| D1 | Hébergeur statique + CI | GitHub Actions pour le pipeline, Cloudflare Pages (ou Netlify) pour l'hébergement | Le manifeste PWA a `"scope": "/"` : il faut un service qui sert le site à la racine d'un domaine sans configuration de sous-chemin. GitHub Pages impose des détours (branche `gh-pages`, en-têtes limités) pour ce cas ; Cloudflare Pages et Netlify se branchent directement sur `lachand/releve-meteo`, déploient à la racine à chaque push sur `main`, et ont un plan gratuit suffisant. |
| D2 | Source de `coastline-fr.json` | Extraction depuis le jeu de côtes OpenStreetMap (`osmdata.openstreetmap.de/data/coastlines`) ou Natural Earth 10 m, simplifiée par un script one-off (Node ou Python), échantillonnée tous les 2 km sur la façade métropolitaine + Corse | ARCHITECTURE.md §3.4 fixe le format et la cible (< 60 ko gzip) mais pas la source. Le script de génération n'est pas un livrable applicatif : il tourne une fois, son résultat est versionné. |
| D3 | Provenance des polices IBM Plex | Télécharger les sources officielles (licence SIL OFL), sous-ensembler en latin étendu avec `pyftsubset` ou `glyphhanger`, produire les 4 `.woff2` listés dans `PRECACHE_SHELL` | La licence SIL OFL autorise l'auto-hébergement exigé par SERVICE_WORKER.md §11. À vérifier une fois, pas à chaque build. |
| D4 | Artwork des icônes PWA | Créer un monogramme simple dérivé du vocabulaire visuel de DESIGN.md (papier millimétré, encre), décliné en 192, 512 et une variante maskable avec zone de sécurité | Aucune maquette d'icône n'existe dans DESIGN.md. Prérequis bloquant du manifeste au Lot 3, autant le préparer au Lot 0. |
| D5 | Détenteur des clés API optionnelles pour les spikes CORS | Un compte Infoclimat et un compte Vigilance à créer avant le Lot 4 et le Lot 6, sous le contrôle du porteur du projet | Les spikes CORS ne peuvent pas être menés sans clé, même pour constater un blocage. |

---

## 3. Dépendances entre lots

L'ordre numérique de BACKLOG.md est globalement un ordre de dépendance
valide, à trois exceptions près qui ne sautent pas aux yeux à la lecture du
backlog seul :

```mermaid
graph LR
  L0["Lot 0 — Socle"] --> L1["Lot 1 — Prevision et cascade"]
  L1 --> L2["Lot 2 — Confiance"]
  L2 --> L3["Lot 3 — PWA"]
  L1 --> L4["Lot 4 — Observe vs estime"]
  L2 -.derived.ts.-> L4
  L1 --> L5["Lot 5 — Multi-lieux"]
  L2 -.derived.ts.-> L5
  L0 --> L6["Lot 6 — Radar et vigilance"]
  L3 -."cache tiles" du SW.-> L6
  L1 --> L7["Lot 7 — Fiabilite et alertes"]
  L3 -."sw.ts existant".-> L7
  L2 -.derived.ts.-> L8["Lot 8 — Solaire"]
```

Les trois écarts à connaître avant de commencer :

1. **`domain/derived.ts` est écrit en entier au Lot 2**, mais ses fonctions
   sont branchées à l'UI en trois temps : `rollingSum` au Lot 4, `dewPoint` /
   `frostRisk` / `fogRisk` au Lot 5, `solarYieldKwh` au Lot 8. Ne pas
   réécrire ni retester ce module plus tard, seulement le consommer.
2. **`navigator.storage.persist()` (SERVICE_WORKER.md §8) doit être demandé
   après le premier favori enregistré**, mais les favoris n'existent que
   depuis le Lot 5, alors que la tâche est listée au Lot 3. Au Lot 3,
   implémenter `ensureStorageHeadroom` et la fonction d'appel à `persist()`,
   mais ne la brancher qu'au Lot 5 quand l'événement « premier favori »
   existe réellement. Consigner ce report dans BACKLOG.md à l'issue du Lot 3.
3. **Le Lot 6 (tuiles radar) et le Lot 7 (Web Push) modifient tous les deux
   `src/pwa/sw.ts` écrit au Lot 3.** SERVICE_WORKER.md le dit en préambule :
   toute modification de ce fichier impose de relire le document en entier.
   Ne pas traiter Lot 6 et Lot 7 comme des lots qui n'ont plus rien à voir
   avec le service worker.

---

## 4. Jalons

| Jalon | Fin de lot | Ce qui devient vrai |
|---|---|---|
| M1 · Squelette vert | Lot 0 | CI passe sur un dépôt sans code applicatif, déploiement en ligne accessible. |
| M2 · Prévision lisible | Lot 1 | Recherche de commune, cascade de modèles, timeline 48 h et vue 7 jours fonctionnels en ligne. Sans confiance ni hors ligne. |
| M3 · Le produit tient sa thèse | Lot 2 | Bande d'incertitude, panneau de confiance, mode comparaison. C'est la première version qui incarne réellement le principe de transparence d'AGENTS.md. |
| M4 · Installable | Lot 3 | Application installable, fonctionnelle hors ligne, cycle de mise à jour sans boucle de rechargement. |
| M5 · Transparent sur le réel | Lot 4 | Plus aucune valeur affichée sans provenance observée/estimée/prévue. |
| M6 · Multi-lieux | Lot 5 | Favoris, alias, URL partageable, enrichissements dérivés. |
| M7 · Carte et vigilance | Lot 6 | Radar hors ligne sur tuiles visitées, bandeau de vigilance. |
| M8 · V1 complète | Lot 7 | Fiabilité locale par modèle, alertes adaptées au support réel de l'appareil. |
| Lot 8, solaire | optionnel | Peut être reporté après une V1 jugée suffisante ; ne bloque aucun autre lot. |

---

## 5. Détail lot par lot

### Lot 0 — Socle technique

**Objectif** : `npm run verify` vert sur un projet vide, déploiement continu en place, avant toute logique métier.

**Ordre de construction**
1. Trancher D1 à D4 (section 2) : sans hébergeur choisi, le critère de sortie du lot n'est pas atteignable.
2. `npm create vite@latest` (template `react-ts`) ; activer dans `tsconfig.json` : `strict`, `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`.
3. ESLint (config plate) + `eslint-plugin-import` avec la règle `import/no-restricted-paths` interdisant `domain → data` et `domain → ui` ; Prettier.
4. Vitest avec les seuils de TESTING.md §1, Testing Library, MSW ; Playwright avec les trois moteurs plus le viewport mobile 380 px.
5. Créer l'arborescence complète d'ARCHITECTURE.md §2, fichiers vides (`export {}`), pour que la structure ne bouge plus ensuite.
6. `src/domain/constants.ts` et `src/domain/types.ts` en entier : aucune dépendance, aucune raison de les reporter.
7. Récupérer et sous-ensembler les polices IBM Plex (D3), les placer dans `public/fonts/` ; écrire `src/ui/styles/tokens.css` depuis DESIGN.md §2 à §4.
8. Page statique « Sources et licences » (attributions Open-Meteo, Météo-France, OpenStreetMap).
9. Pipeline CI (`lint`, `format:check`, `typecheck`, `test`, `build`) et déploiement automatique sur push vers `main`.

**Sortie** : voir BACKLOG.md Lot 0.

---

### Lot 1 — Prévision de base et cascade

**Objectif** : une prévision réelle affichée, avec la cascade de modèles visible à l'écran.

**Ordre de construction**
1. `domain/time.ts` + tests, dont les deux cas de changement d'heure — rien d'autre n'en dépend, tout le reste peut en dépendre.
2. `domain/modelCascade.ts` + tests, toutes les bornes de TESTING.md §2.1.
3. Générer `coastline-fr.json` (D2), puis `domain/terrain.ts` + tests.
4. Construire les fixtures `nominal-summer`, `arome-truncated`, `dst-spring`, `dst-autumn` **maintenant**, avant le mapper qui les consomme en tests MSW.
5. `data/clients/http.ts` (`HttpResult`, backoff exponentiel avec jitter) + tests MSW.
6. **Vérifier les identifiants de modèle Open-Meteo réels** (`OPEN_METEO_MODEL_IDS` d'ARCHITECTURE.md §4.1) contre la documentation à jour, avant d'écrire le mapper. Consigner tout écart dans BACKLOG.md.
7. `data/clients/geocoding.ts` (filtré `country_code=FR`), `data/clients/openMeteo.ts` et `buildForecastUrl`.
8. `data/mappers/openMeteoMapper.ts`, avec l'invariant de timeline commune ; tests de TESTING.md §3.1.
9. `data/cache/db.ts` (magasins `forecasts` et `geocoding`, repli mémoire si `indexedDB` indisponible), `data/queue.ts` (déduplication).
10. `data/repository.ts` : `getForecast`, `searchPlaces`.
11. UI : recherche de commune et géolocalisation, bloc « maintenant » (DESIGN.md §6.1), timeline 48 h avec badge de modèle et marqueur de transition, vue 7 jours, les quatre états `loading`/`ready`/`empty`/`error`.

**Sortie** : voir BACKLOG.md Lot 1.

---

### Lot 2 — Confiance et comparaison

**Objectif** : la dispersion inter-modèles devient visible et lisible, sans jamais passer par la couleur.

**Ordre de construction**
1. `domain/confidence.ts` + tests, dont les cas de pénalité terrain.
2. `domain/derived.ts` + tests, **écrit en entier ici** (`dewPoint`, `frostRisk`, `fogRisk`, `rollingSum`, `solarYieldKwh`) même si seule une partie sera branchée à l'UI dans ce lot. Voir section 3, écart n°1.
3. Fixtures `all-dry`, `high-divergence`, `arome-missing`.
4. Encodage de la confiance par texture de trait dans Chart.js, bande d'incertitude en hachures diagonales (motif SVG, jamais un aplat translucide).
5. Panneau « modèle actif » / « confiance » (DESIGN.md §6.2), mode comparaison avec sa légende propre (DESIGN.md §6.3), texte « pourquoi ce modèle ».
6. Table de données équivalente accessible pour chaque graphique, **dès ce lot** : c'est une exigence transverse (TESTING.md §4 et §6.6), pas un rattrapage de fin de lot.

**Sortie** : voir BACKLOG.md Lot 2.

---

### Lot 3 — PWA

**Objectif** : application installable, fonctionnelle hors ligne, sans jamais remplacer son propre code pendant que l'utilisateur regarde l'écran.

**Ordre de construction**
1. Relire SERVICE_WORKER.md en entier (rappelé par le document lui-même).
2. Finaliser l'artwork des icônes si non préparé au Lot 0 (D4) : prérequis bloquant du manifeste.
3. `public/manifest.webmanifest`.
4. Plugin Vite de génération du manifeste de précache (nécessaire avant `sw.ts`, qui consomme `BUILD_MANIFEST_ASSETS`).
5. `src/pwa/sw.ts` selon la table de routage §5, injection de `__BUILD_ID__`.
6. `offline.html`.
7. Cycle de mise à jour : bandeau, `src/pwa/install.ts`, protocole `postMessage`/`skipWaiting`/`controllerchange` avec protection anti-boucle.
8. `ensureStorageHeadroom` et la purge. Écrire la fonction d'appel à `navigator.storage.persist()` mais **ne pas la brancher** tant que les favoris n'existent pas (voir section 3, écart n°2) ; consigner ce report.
9. SW désactivé en développement sauf `VITE_SW=1`, commande `sw:reset`.
10. Test e2e de régression du service worker (TESTING.md §6.5), checklist SERVICE_WORKER.md §13.

**Sortie** : voir BACKLOG.md Lot 3.

---

### Lot 4 — Observé contre estimé

**Objectif** : aucune valeur affichée sans que sa provenance soit visible.

**Ordre de construction**
1. **Spike bloquant** : valider empiriquement le CORS d'Infoclimat depuis un navigateur réel, avant toute UI. Consigner le résultat dans BACKLOG.md immédiatement, que le CORS passe ou non.
2. Si le CORS passe : `data/clients/infoclimat.ts` et son mapper, recherche de station dans un rayon paramétrable (15 km par défaut), saisie de la clé dans les réglages.
   Si le CORS bloque : livrer uniquement le repli Open-Meteo sur `past_days`, étiqueté `estimated`, sans les items qui dépendent d'Infoclimat.
3. Brancher `rollingSum` (déjà écrit au Lot 2) sur les cumuls 24 h et 7 jours.
4. Encodage de la provenance dans l'UI (pastille pleine / creuse, DESIGN.md §5).
5. Test transverse d'attribution de provenance (TESTING.md §3.4).

**Sortie** : voir BACKLOG.md Lot 4.

---

### Lot 5 — Multi-lieux et enrichissements

**Objectif** : l'application gère plusieurs lieux et exploite le reste de la couche domaine déjà écrite.

**Ordre de construction**
1. Favoris avec réordonnancement, persistés (la structure `Preferences.favourites` existe depuis ARCHITECTURE.md §4.6, seule l'UI manque).
2. Revenir sur le Lot 3 : brancher `navigator.storage.persist()` sur l'événement « premier favori enregistré », maintenant qu'il existe réellement. Ferme l'écart n°2 de la section 3.
3. Alias personnalisés, URL partageable `?lat=&lon=` avec validation métropole (`isWithinMetropolitanFrance`, déjà écrit au Lot 1).
4. Barre de bascule entre lieux (DESIGN.md §6.1, bas d'écran).
5. Courbe de pression 72 h, point de rosée, risque de gel, risque de brouillard : branche enfin le reste de `derived.ts` écrit au Lot 2. Rose des vents, UV, lever/coucher du soleil.
6. Réglages : unités, thème, purge des données locales.

**Sortie** : voir BACKLOG.md Lot 5.

---

### Lot 6 — Radar et vigilance

**Objectif** : une carte utilisable hors ligne sur les tuiles déjà visitées, sans dépendre d'une clé optionnelle.

**Ordre de construction**
1. Carte Leaflet, tuiles OpenStreetMap, attribution conforme.
2. Overlay radar RainViewer. **Dépend de la route SW n°7 du Lot 3** (cache `tiles` avec expiration 15 min) : si le Lot 3 n'est pas terminé, ce lot est bloqué malgré son numéro.
3. **Spike bloquant** : valider le CORS de l'API Vigilance avant toute UI. Si bloqué, masquer proprement la fonctionnalité et consigner l'écart.
4. Bandeau de vigilance par département (DESIGN.md §6.2, haut d'écran), saisie de la clé dans les réglages.
5. Vérifier que le cache de tuiles survit à un déploiement (le cache `tiles` est volontairement hors du versionnement de build, SERVICE_WORKER.md §2).

**Sortie** : voir BACKLOG.md Lot 6.

---

### Lot 7 — Fiabilité locale et alertes

**Objectif** : un score de fiabilité par modèle calculé sur l'appareil, des alertes dont le texte reflète le support réel de la plateforme.

**Ordre de construction**
1. `domain/reliability.ts` + tests.
2. Magasins `archive` et `reliability` en IndexedDB : migration incrémentale de la base `meteo-fr` (jamais de recréation, ARCHITECTURE.md §4.5), test de migration dédié qui préserve l'archive existante.
3. `archiveForScoring` appelé à chaque récupération de prévision (modifie `data/repository.ts` du Lot 1).
4. Appariement des prévisions archivées avec le réalisé, purge à 90 jours.
5. Écran de fiabilité (DESIGN.md §6.4) avec l'état « en collecte », mention explicite que le calcul reste sur l'appareil.
6. Règles d'alerte (création, édition, activation), `detectPushSupport`.
7. Évaluation des règles à l'ouverture, mode `foreground-only`.
8. Web Push en mode `full` uniquement : **modifie `src/pwa/sw.ts` du Lot 3** (handlers `push` et `notificationclick`). Relire SERVICE_WORKER.md avant toute modification, comme rappelé en tête du document.

**Sortie** : voir BACKLOG.md Lot 7.

---

### Lot 8 — Irradiance et solaire (optionnel)

**Objectif** : une estimation de production PV présentée comme telle, jamais comme une mesure.

**Ordre de construction**
1. Saisie de la puissance crête dans les réglages.
2. Brancher `solarYieldKwh` (déjà écrit au Lot 2) sur `shortwave_radiation`.
3. Courbe de production estimée sur 48 h, indicateur « journée favorable au surplus ».
4. Mention claire de l'absence de prise en compte de l'orientation et des masques.

**Sortie** : voir BACKLOG.md Lot 8.

---

## 6. Rappel : définition de terminé

Voir BACKLOG.md, section « Définition de terminé, applicable à chaque lot ».
Ce plan ne la répète pas ; il ne fait que fixer l'ordre pour l'atteindre.

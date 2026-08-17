# BACKLOG.md

Chaque lot est livrable et déployable indépendamment. Ne pas démarrer un lot tant que les critères de sortie du précédent ne sont pas remplis.

Cocher les tâches au fur et à mesure. Consigner tout écart en fin de fichier.

---

## Lot 0 : socle technique

- [ ] Initialiser Vite, TypeScript `strict` avec `noUncheckedIndexedAccess`
- [ ] Configurer ESLint, dont `import/no-restricted-paths` interdisant `domain -> data` et `domain -> ui`
- [ ] Configurer Prettier, Vitest avec seuils de couverture, Playwright
- [ ] Créer l'arborescence de `ARCHITECTURE.md` section 2, avec fichiers vides
- [ ] Écrire `src/domain/constants.ts` et `src/domain/types.ts` en entier
- [ ] Écrire `src/ui/styles/tokens.css` depuis `DESIGN.md`
- [ ] Auto-héberger les quatre fichiers de police en `woff2`, sous-ensemble latin étendu
- [ ] Pipeline CI complet, y compris sur un dépôt sans code applicatif
- [ ] Déploiement statique automatique sur la branche principale
- [ ] Page « Sources et licences » avec les attributions Open-Meteo, Météo-France, OpenStreetMap

**Sortie** : `npm run verify` passe sur un projet vide. Le déploiement est en ligne.

---

## Lot 1 : prévision de base et cascade

- [ ] `domain/time.ts` avec ses tests, dont les deux cas de changement d'heure
- [ ] `domain/modelCascade.ts` avec ses tests, toutes les bornes
- [ ] `domain/terrain.ts` avec ses tests, plus génération de `coastline-fr.json`
- [ ] `data/clients/http.ts` avec `HttpResult`, backoff, tests MSW
- [ ] `data/clients/geocoding.ts`, filtré `country_code=FR`
- [ ] `data/clients/openMeteo.ts` et `buildForecastUrl`
- [ ] `data/mappers/openMeteoMapper.ts`, avec l'invariant de timeline commune
- [ ] `data/cache/db.ts`, magasins `forecasts` et `geocoding`, repli mémoire
- [ ] `data/queue.ts`, déduplication
- [ ] `data/repository.ts`, `getForecast` et `searchPlaces`
- [ ] Vérifier les identifiants de modèle Open-Meteo contre la documentation réelle
- [ ] UI : recherche de commune, géolocalisation navigateur
- [ ] UI : bloc « maintenant » selon `DESIGN.md` 6.1, avec le modèle affiché
- [ ] UI : timeline 48 h avec badge de modèle et marqueur de transition
- [ ] UI : vue 7 jours
- [ ] UI : les quatre états `loading`, `ready`, `empty`, `error`
- [ ] Fixtures `nominal-summer`, `arome-truncated`, `dst-spring`, `dst-autumn`

**Sortie** : couverture 100 % sur `src/domain/`. La transition AROME vers ARPEGE est visible à l'écran. Aucun `?? 0` sur une mesure dans tout le dépôt.

---

## Lot 2 : confiance et comparaison

- [ ] `domain/confidence.ts` avec ses tests, dont les cas de pénalité terrain
- [ ] `domain/derived.ts` avec ses tests
- [ ] Encodage de la confiance par texture de trait dans Chart.js
- [ ] Bande d'incertitude hachurée, motif SVG diagonal, pas d'aplat translucide
- [ ] Panneau latéral « modèle actif » et « confiance » de `DESIGN.md` 6.2
- [ ] Mode comparaison de `DESIGN.md` 6.3, avec sa légende propre
- [ ] Texte explicatif « pourquoi ce modèle »
- [ ] Table de données équivalente accessible pour chaque graphique
- [ ] Fixtures `all-dry`, `high-divergence`, `arome-missing`

**Sortie** : la bande d'incertitude s'ouvre visiblement sur `high-divergence` et disparaît sur un cas d'accord. La légende est permanente.

---

## Lot 3 : PWA

Lire `SERVICE_WORKER.md` en entier avant de commencer.

- [ ] `manifest.webmanifest` et jeu d'icônes, dont une maskable
- [ ] `src/pwa/sw.ts` selon la table de routage, sans Workbox
- [ ] Injection de `__BUILD_ID__` au build
- [ ] Plugin Vite de génération du manifeste de précache
- [ ] `offline.html`
- [ ] Cycle de mise à jour avec bandeau et rechargement unique protégé
- [ ] `src/pwa/install.ts`, prompt personnalisé via `beforeinstallprompt`
- [ ] `ensureStorageHeadroom` et purge
- [ ] `navigator.storage.persist()` après le premier favori
- [ ] SW désactivé en développement, commande `sw:reset`
- [ ] Test e2e de régression du service worker, `TESTING.md` 6.5
- [ ] Checklist `SERVICE_WORKER.md` 13 exécutée

**Sortie** : deux déploiements successifs vérifiés, pas de boucle de rechargement, mode avion fonctionnel, Lighthouse déclare l'application installable.

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
| | | | |

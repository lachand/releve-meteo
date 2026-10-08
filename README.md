# Relevé

Prévisions météo multi-modèles pour la France métropolitaine. PWA sans
backend, hébergement statique, API gratuites uniquement.

Ce qui distingue ce produit d'un wrapper d'API météo : la **transparence sur
la provenance**. L'application ne dit jamais « il fera 14 °C ». Elle dit
« AROME prévoit 14 °C, les autres modèles s'écartent de 0.8 °C, confiance
élevée ». Voir [AGENTS.md](AGENTS.md) pour le principe complet.

## Ce que fait Relevé

- **Choisit le meilleur modèle pour le lieu, et le justifie.** Sept modèles
  (AROME 1,3 km, AROME France, ICON-D2, ARPEGE, ICON-EU, ECMWF IFS, GFS)
  sont notés à chaque échéance : maille et terrain, qualité en moyenne
  échéance, erreur mesurée ici. Le modèle retenu apparaît en tampon, avec
  une note qui cite ses vrais critères chiffrés. Vous pouvez imposer un
  modèle ; chaque fiche dit ses points forts et ses points faibles.
- **Vérifie les modèles contre le réel.** Les prévisions émises jusqu'à
  sept jours avant sont comparées, sur 30 jours, aux mesures de la station
  la plus proche (Meteostat), à défaut à la réanalyse ERA5, signalée comme
  estimation. Ces scores alimentent directement le choix du modèle.
- **Confronte le modèle au dernier relevé.** Sous la valeur du moment, la
  dernière mesure de la station représentative du lieu et l'écart du
  modèle retenu ; dans l'onglet Fiabilité, chaque modèle face à cette
  mesure, à l'heure du relevé et sur les six dernières heures. Toujours
  station à station : les modèles sont lus au point exact de la station
  et à son altitude, jamais au lieu, pour que l'écart ne mêle pas la
  distance entre les deux.
- **Montre la prévision la plus complète possible** : maintenant, pluie au
  quart d'heure sur 2 h, phénomènes à surveiller sur 72 h (orage, forte
  pluie, neige, verglas, gel, brouillard, vent fort, chaleur, avec leurs
  critères), ruban horaire sur 72 h puis toutes les 3 h jusqu'à 10 jours,
  10 jours avec le modèle retenu chaque jour, éventail de l'ensemble ECMWF
  sur 15 jours, pression, rose des vents, qualité de l'air et pollens.
- **Cartographie** : radar observé sur les deux dernières heures, carte
  de prévision sur 48 h (pluie et température du modèle retenu, une case
  tous les 12,5 km sur 100 km autour du lieu, valeurs écrites dans les
  cases) et carte des favoris en étiquettes de station, sur un fond de
  carte sépia.
- **Vigilance Météo-France officielle** du département, sans clé : bandeau
  en tête du relevé dès le jaune, avec période, heure du bulletin et lien
  vers la carte officielle ; distincte des phénomènes calculés par Relevé.
- **Hier, prévu contre réel, et échéances courtes.** Pour hier, ce que
  chaque modèle prévoyait la veille face aux mesures de la station ; de 1 à
  12 h, des notes établies sur les prévisions que l'application enregistre
  elle-même (« en collecte » tant qu'il manque des heures comparables, donc
  seulement quand elle est ouverte) ; et le biais de chaque modèle la nuit,
  le matin, l'après-midi et le soir, dit sans jamais corriger les valeurs.
- **Pratique** : meilleur créneau sans pluie, production solaire estimée
  si vous saisissez la puissance crête (une estimation, sans orientation ni
  masques), feuille de registre imprimable. Pas de verdicts d'usage (vélo,
  linge...) : trop subjectifs.
- **Alertes personnelles** : un seuil par lieu (gel, chaleur, pluie,
  rafales), vérifié à chaque ouverture sur 72 h, avec le modèle qui le
  franchit.
- **Veille en arrière-plan**, sans serveur : là où le navigateur le permet
  (Chrome ou Edge, application installée), le service worker recharge de
  temps en temps la prévision des favoris et des lieux à alertes, avec la
  même cascade de modèles, et notifie une alerte franchie ou une vigilance
  orange ou rouge. Ailleurs, l'interface dit que les alertes sont vérifiées
  à l'ouverture.
- **Reste transparent** : chaque valeur dit quel modèle la produit ; une
  donnée empruntée à un autre modèle est nommée ; les changements de modèle
  sont marqués, jamais lissés ; l'incertitude est une bande hachurée.
- **Ressemble à un carnet de météorologue** : papier de registre, encre de
  plume, pictogrammes du temps au trait (lune la nuit), flèches de vent,
  thème sombre.
- **Fonctionne hors ligne** (PWA installable), sans backend ni clé d'API.

Plan de la refonte : [ROADMAP.md](ROADMAP.md). Avancement par lot et écarts
constatés : [BACKLOG.md](BACKLOG.md).

Le déploiement continu se fait via Cloudflare Workers Builds, connecté au
dépôt GitHub : build `npm run build`, puis `npx wrangler versions upload`
(ou `deploy` sur la branche de production), configuré par `wrangler.jsonc`
(assets de `dist`, repli sur `index.html`).

## Développement

```
npm install
npm run dev       # serveur de développement
npm run verify    # lint, format, typecheck, tests, build, e2e
python3 scripts/generate-stations.py   # rafraichir la liste des stations
```

Les tests e2e ne font aucun appel réseau : ils rejouent des réponses
réelles enregistrées (`tests/fixtures/live/`) avec une horloge figée. Si
le Chromium attendu par Playwright n'est pas installé, indiquer le binaire
disponible par `PW_CHROMIUM_PATH`.

Le service worker est désactivé en développement (`npm run dev`), sauf avec
`VITE_SW=1 npm run dev`. En cas de comportement inexplicable côté PWA
(contenu périmé, écran blanc après une modification), commencer par
« Application » puis « Unregister » dans les outils de développement du
navigateur avant toute autre investigation, ou lancer `npm run sw:reset`
(voir [SERVICE_WORKER.md](SERVICE_WORKER.md) section 11).

## Application Android et widgets

Un habillage Android (dossier `android/`) embarque le build web dans une
WebView et ajoute trois widgets (une vignette 1×1, un petit et un moyen) qui
disent le modèle retenu, la confiance (hors vignette, qui la dit à l'oreille)
et l'âge de leur contenu. Le contenu est calculé par la même
logique TypeScript que la page, dans une WebView sans interface lancée par
WorkManager : rien n'est récrit en Kotlin. APK de test : artefact
`releve-debug-apk` du workflow « Android ». Détails, limites et suite dans
[WIDGET_ANDROID.md](WIDGET_ANDROID.md).

## Documentation

| Fichier | Contenu |
|---|---|
| [AGENTS.md](AGENTS.md) | Règles non négociables, protocole de travail, point d'entrée |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Couches, signatures TypeScript, schémas IndexedDB, payloads API |
| [DESIGN.md](DESIGN.md) | Tokens, typographie, maquettes, règles de rendu |
| [SERVICE_WORKER.md](SERVICE_WORKER.md) | Spécification du service worker et du cache |
| [TESTING.md](TESTING.md) | Tests unitaires, intégration, e2e, non-régression |
| [BACKLOG.md](BACKLOG.md) | Lots, tâches, critères de sortie |
| [ROADMAP.md](ROADMAP.md) | Plan de la refonte « Relevé 2 » |
| [WIDGET_ANDROID.md](WIDGET_ANDROID.md) | Widget Android : essais, architecture, limites |

## Stack

```
Vite + TypeScript strict + React 18
Chart.js 4 (graphiques)
Leaflet 1.9 (carte)
Vitest + Testing Library + MSW (tests unitaires et intégration)
Playwright (e2e, visuel)
ESLint + Prettier
```

## Sources de données

Toutes gratuites et sans clé :

- [Open-Meteo](https://open-meteo.com/) (CC BY 4.0) : les sept modèles
  déterministes, l'ensemble ECMWF, les prévisions passées (Previous Runs),
  la réanalyse ERA5, la qualité de l'air et les pollens CAMS, le géocodage ;
- [Meteostat](https://meteostat.net/) (CC BY-NC 4.0) : relevés horaires
  des stations, seules les sources d'observation étant retenues ;
- [RainViewer](https://www.rainviewer.com/) : radar ;
- [EUMETSAT](https://view.eumetsat.int/) (EUMETView) : éclairs observés par
  l'imageur d'éclairs du satellite MTG ;
- [Vigilance Météo-France](https://vigilance.meteofrance.fr/fr) (Licence
  Ouverte) : vigilance départementale, lue sans clé sur le jeu public
  d'[Opendatasoft](https://public.opendatasoft.com/explore/dataset/weatherref-france-vigilance-meteo-departement/)
  qui la republie ;
- IGN Admin Express (Licence Ouverte) : contours simplifiés des
  départements, pour situer un lieu hors ligne ;
- [OpenStreetMap](https://www.openstreetmap.org/) (ODbL) : fond de carte.

Attribution complète dans l'application, page « Sources et licences ».

**Usage non commercial.** L'API gratuite d'Open-Meteo est réservée à un usage
non commercial (au-delà, un abonnement est requis) et les relevés Meteostat
sont sous CC BY-NC. Relevé convient donc à un usage personnel, associatif ou
pédagogique ; le proposer comme service payant, avec publicité ou à une
entreprise exigerait d'abord un accès commercial à ces deux sources, ou une
autre source d'observations sans clause non commerciale (à étudier).

Infoclimat demande une clé ou un compte : il n'est pas intégré (voir
[BACKLOG.md](BACKLOG.md), Écarts constatés).

## Licence

[MIT](LICENSE).

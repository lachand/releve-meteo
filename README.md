# Relevé

Prévisions météo multi-modèles pour la France métropolitaine. PWA sans
backend, hébergement statique, API gratuites uniquement.

Ce qui distingue ce produit d'un wrapper d'API météo : la **transparence sur
la provenance**. L'application ne dit jamais « il fera 14 °C ». Elle dit
« AROME prévoit 14 °C, les autres modèles s'écartent de 0.8 °C, confiance
élevée ». Voir [AGENTS.md](AGENTS.md) pour le principe complet.

## État du projet

Lots 0 à 3 et 5 terminés : recherche de commune, géolocalisation, cascade
AROME → ARPEGE → ICON-EU → GFS avec transition visible, timeline 48 h, vue
7 jours, bande d'incertitude, mode comparaison, panneau modèle/confiance,
cache IndexedDB avec repli mémoire, les quatre états d'interface,
fonctionnement hors ligne complet (service worker, manifeste installable,
bandeau de mise à jour), favoris réordonnables avec alias, URL partageable
`?lat=&lon=`, réglages (unité de vent, thème, purge des données locales), et
les enrichissements dérivés (pression 72 h, point de rosée, risques de gel
et de brouillard, rose des vents, UV, lever/coucher du soleil). Le Lot 4
(observé contre estimé) est en attente d'un compte Infoclimat pour mener le
spike CORS bloquant ; pas encore de fiabilité locale (Lot 7). Voir
[BACKLOG.md](BACKLOG.md) pour le découpage en lots et l'avancement, et
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) pour l'ordre de
construction retenu.

Le déploiement continu se fait via Cloudflare Pages, connecté au dépôt
GitHub (build `npm run build`, dossier de sortie `dist`).

## Développement

```
npm install
npm run dev       # serveur de développement
npm run verify    # lint, format, typecheck, tests, build, e2e
```

Le service worker est désactivé en développement (`npm run dev`), sauf avec
`VITE_SW=1 npm run dev`. En cas de comportement inexplicable côté PWA
(contenu périmé, écran blanc après une modification), commencer par
« Application » puis « Unregister » dans les outils de développement du
navigateur avant toute autre investigation, ou lancer `npm run sw:reset`
(voir [SERVICE_WORKER.md](SERVICE_WORKER.md) section 11).

## Documentation

| Fichier | Contenu |
|---|---|
| [AGENTS.md](AGENTS.md) | Règles non négociables, protocole de travail, point d'entrée |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Couches, signatures TypeScript, schémas IndexedDB, payloads API |
| [DESIGN.md](DESIGN.md) | Tokens, typographie, maquettes, règles de rendu |
| [SERVICE_WORKER.md](SERVICE_WORKER.md) | Spécification du service worker et du cache |
| [TESTING.md](TESTING.md) | Tests unitaires, intégration, e2e, non-régression |
| [BACKLOG.md](BACKLOG.md) | Lots, tâches, critères de sortie |

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

[Open-Meteo](https://open-meteo.com/) (modèles AROME, ARPEGE, ICON-EU, GFS,
géocodage), [Infoclimat](https://www.infoclimat.fr/) (relevés observés,
optionnel), [Météo-France Vigilance](https://vigilance.meteofrance.fr/)
(optionnel), [RainViewer](https://www.rainviewer.com/) (radar),
[OpenStreetMap](https://www.openstreetmap.org/) (fond de carte). Attribution
complète dans l'application, page « Sources et licences ».

## Licence

[MIT](LICENSE).

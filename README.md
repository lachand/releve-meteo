# Relevé

Prévisions météo multi-modèles pour la France métropolitaine. PWA sans
backend, hébergement statique, API gratuites uniquement.

Ce qui distingue ce produit d'un wrapper d'API météo : la **transparence sur
la provenance**. L'application ne dit jamais « il fera 14 °C ». Elle dit
« AROME prévoit 14 °C, les autres modèles s'écartent de 0.8 °C, confiance
élevée ». Voir [AGENTS.md](AGENTS.md) pour le principe complet.

## État du projet

Lot 0 (socle technique) en place : projet Vite + TypeScript strict, ESLint
avec garde-fou d'architecture, Vitest, Playwright, polices et icônes
auto-hébergées, page Sources et licences, CI GitHub Actions. Aucune
prévision météo réelle encore : voir [BACKLOG.md](BACKLOG.md) pour le
découpage en lots et l'avancement, et [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
pour l'ordre de construction retenu.

Le déploiement continu se fait via Cloudflare Pages, connecté au dépôt
GitHub (build `npm run build`, dossier de sortie `dist`).

## Développement

```
npm install
npm run dev       # serveur de développement
npm run verify    # lint, format, typecheck, tests, build, e2e
```

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

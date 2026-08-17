# AGENTS.md

Point d'entrée pour l'agent développeur. Lire ce fichier en entier avant toute écriture de code.

## Projet

PWA de prévisions météo pour la France métropolitaine, sans backend, hébergement statique, API gratuites uniquement.

Ce qui distingue ce produit d'un wrapper d'API : la **transparence sur la provenance**. L'application ne dit jamais « il fera 14 °C ». Elle dit « AROME prévoit 14 °C, les autres modèles s'écartent de 0.8 °C, confiance élevée ». Toute décision d'implémentation qui dilue cette transparence est une régression produit, même si elle rend l'interface plus jolie.

## Ordre de lecture

| Fichier | Contenu | Quand le lire |
|---|---|---|
| `AGENTS.md` | Ce fichier. Règles globales. | Toujours, en premier |
| `ARCHITECTURE.md` | Couches, signatures TypeScript, schémas IndexedDB, payloads API | Avant d'écrire du code applicatif |
| `DESIGN.md` | Tokens, typographie, maquettes ASCII, règles de rendu | Avant d'écrire du code UI |
| `SERVICE_WORKER.md` | Spécification complète du SW et du cache | Au lot 3, et avant toute modification de `sw.ts` |
| `TESTING.md` | Tests unitaires, intégration, e2e, non-régression | Avant d'écrire du code, et à chaque lot |
| `BACKLOG.md` | Lots, tâches, critères de sortie | Pour choisir quoi faire ensuite |

## Règles non négociables

1. **`src/domain/` est pur.** Aucun import de React, `fetch`, `localStorage`, `indexedDB`, `Date.now()`. Le temps courant est toujours un paramètre. Cette couche doit s'exécuter dans Node sans polyfill.
2. **TypeScript `strict`.** `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess` activés. Aucun `any`, aucun `!` non justifié par un commentaire.
3. **`null` n'est pas `0`.** Une valeur absente reste `null` de bout en bout. Interdiction absolue de `?? 0` sur une mesure météo. Sur les précipitations, cette confusion produit une erreur métier silencieuse.
4. **Aucune clé API dans le dépôt.** Les clés optionnelles sont saisies par l'utilisateur et stockées localement.
5. **Un bug corrigé égale un test ajouté.** Le test doit échouer avant le correctif.
6. **La transition entre modèles est visible.** Jamais de raccord lissé silencieusement.
7. **Toute donnée affichée porte sa provenance** (`observed`, `estimated`, `forecast`). Vérifié par les tests, pas seulement par convention.
8. **Pas d'em dash dans le code, les commentaires, la documentation ou les textes d'interface.**

## Langue

- Interface, documentation produit, messages utilisateur : français.
- Identifiants, noms de fichiers, commentaires de code, messages de commit : anglais.

## Stack imposée

```
Vite + TypeScript strict + React 18
Chart.js 4 (graphiques)
Leaflet 1.9 (carte)
Vitest + Testing Library + MSW (tests unitaires et intégration)
Playwright (e2e, visuel)
ESLint + Prettier
```

Pas de bibliothèque de state management. Pas de framework CSS utilitaire. Les styles sont écrits à partir des tokens de `DESIGN.md`, en CSS modules.

## Protocole de travail

À chaque tâche :

1. Lire la tâche dans `BACKLOG.md` et ses critères de sortie.
2. Écrire les tests avant l'implémentation pour tout ce qui touche `src/domain/`.
3. Implémenter.
4. Exécuter `npm run verify` (lint, typecheck, tests, build). Ne jamais considérer une tâche terminée sur une CI rouge.
5. Mettre à jour `BACKLOG.md` en cochant la tâche et en notant toute limite connue.

Si une spécification de ces documents est ambiguë ou contradictoire avec la réalité d'une API, ne pas improviser silencieusement : implémenter la solution la plus prudente, et consigner l'écart dans une section `## Écarts constatés` en fin de `BACKLOG.md`.

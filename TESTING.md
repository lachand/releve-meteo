# TESTING.md

## 1. Outillage et seuils

| Niveau | Outil | Emplacement |
|---|---|---|
| Unitaire | Vitest | `src/**/*.test.ts`, colocalisé |
| Intégration données | Vitest + MSW | `src/data/**/*.test.ts` |
| Composants | Vitest + Testing Library | `src/ui/**/*.test.tsx` |
| End-to-end | Playwright | `tests/e2e/` |
| Visuel | Playwright screenshots | `tests/e2e/visual/` |
| Performance | Lighthouse CI | configuration à la racine |

Seuils bloquants :

```
src/domain/**     100 % branches, 100 % lignes
src/data/**        90 % branches
global             80 % lignes
```

`src/ui/` n'a pas de seuil chiffré. On y teste des comportements, pas des lignes. Poursuivre un pourcentage sur du rendu produit des tests qui vérifient que le code fait ce qu'il fait.

## 2. Tests unitaires du domaine

Ces tests s'exécutent sans DOM, sans réseau, sans horloge système. Le temps est toujours injecté.

### 2.1 `modelCascade`

| Cas | Attendu |
|---|---|
| échéance 0 h, tous modèles | `arome` |
| échéance 36 h exactement | `arome` (borne incluse) |
| échéance 36,01 h | `arpege` |
| échéance 96 h exactement | `arpege` |
| échéance 96,01 h | `icon_eu` |
| échéance 168 h exactement | `icon_eu` |
| échéance 168,01 h | `null` |
| échéance 12 h, AROME absent | `arpege`, jamais un modèle plus fin |
| échéance 12 h, seul GFS disponible | `gfs` |
| liste `available` vide | `null`, aucune exception |
| échéance négative (donnée passée) | `null` |
| `buildCascade` sur 168 points | segments contigus, sans chevauchement, ordonnés |
| `buildCascade`, AROME absent | un seul segment ARPEGE, pas de segment vide |
| `transitionIndices` | exactement 2 transitions sur une cascade complète |
| `blendByCascade` | chaque point porte le `model` du segment correspondant |

### 2.2 `terrain`

| Cas | Attendu |
|---|---|
| altitude 950 m, loin de la côte | `mountain` |
| altitude 900 m exactement | `plateau`, pas `mountain` |
| altitude 301 m | `plateau` |
| altitude 300 m exactement | `plain` |
| distance côte 9,9 km, altitude 1200 m | `coastal`, la règle littoral prime |
| distance côte 10 km exactement | pas `coastal` |
| Val de Virieu (45.49, 5.47, 468 m) | `plateau` |
| Golfe du Morbihan (47.57, -2.80, 5 m) | `coastal` |
| Chamonix (45.92, 6.87, 1035 m) | `mountain` |
| Beauce (48.20, 1.70, 140 m) | `plain` |
| coordonnées à Bruxelles | `isWithinMetropolitanFrance` faux |
| coordonnées en Corse | `isWithinMetropolitanFrance` vrai |
| coordonnées en Guadeloupe | faux, hors périmètre |

`distanceToCoastKm` : vérifier sur trois points de référence avec une tolérance de 3 km, cohérente avec l'échantillonnage du littoral.

### 2.3 `confidence`

| Cas | Attendu |
|---|---|
| écart température 1,4 °C | `high` |
| écart 1,5 °C exactement | `medium` |
| écart 3,5 °C exactement | `medium` |
| écart 3,6 °C | `low` |
| température `high`, vent `low` | verdict global `low` |
| température `high`, vent `high` | verdict global `high` |
| un seul modèle a une valeur | `unavailable` |
| zéro modèle a une valeur | `unavailable`, aucune exception |
| terrain `coastal`, vent `high` | vent dégradé en `medium` |
| terrain `coastal`, température `high` | température inchangée |
| terrain `mountain` | température et précipitations dégradées, vent inchangé |
| pénalité appliquée à un niveau `low` | reste `low`, ne devient pas `unavailable` |
| tous les modèles à 0 mm de pluie | `spread` égal à 0, verdict `high`, pas de `NaN` |
| moyenne de précipitations nulle | pas de division par zéro |
| `drivers` | contient exactement les variables au niveau minimum |
| `spreadBand` avec un modèle à `null` | `min` et `max` calculés sur les modèles restants |
| `spreadBand`, tous à `null` | `{ min: null, max: null }` |

### 2.4 `reliability`

| Cas | Attendu |
|---|---|
| 9 échantillons | `status: 'collecting'`, `mae: null` |
| 10 échantillons | `status: 'ready'`, `mae` calculé |
| jeu connu, erreurs +2, -2, +2, -2 | `mae` 2, `bias` 0 |
| jeu connu, erreurs +2, +2, +2 | `mae` 2, `bias` +2 |
| prévision archivée sans réalisé | ignorée, `sampleCount` inchangé |
| réalisé sans prévision archivée | ignoré |
| entrée de 91 jours | purgée |
| entrée de 89 jours | conservée |
| archive vide | score `collecting`, aucune exception |

### 2.5 `derived`

| Cas | Attendu |
|---|---|
| point de rosée à 20 °C et 50 % HR | 9,3 °C, tolérance 0,1 |
| point de rosée à 0 °C et 100 % HR | 0 °C |
| `frostRisk(-1)` | `likely` |
| `frostRisk(0)` | `likely` |
| `frostRisk(1.9)` | `possible` |
| `frostRisk(2.1)` | `none` |
| `frostRisk(null)` | `none` |
| écart T et Td de 0,5 °C, vent 4 km/h | `fogRisk` `likely` |
| écart 0,5 °C, vent 20 km/h | `none` |
| `rollingSum([1, null, 2], 3)` | somme 3, le `null` ignoré et non compté comme 0 |
| `rollingSum` avec fenêtre entièrement `null` | `null`, pas 0 |
| `solarYieldKwh` sur une journée type, 3 kWc | ordre de grandeur cohérent, non nul |
| `solarYieldKwh` avec radiation entièrement `null` | 0, aucune exception |

### 2.6 `time`

| Cas | Attendu |
|---|---|
| `hoursBetween` sur 24 h ordinaires | 24 |
| `hoursBetween` traversant le passage à l'heure d'été (dernier dimanche de mars) | 23 |
| traversant le passage à l'heure d'hiver (dernier dimanche d'octobre) | 25 |
| `indexOfNow` sur timeline dont tous les points sont passés | -1 |
| `indexOfNow` sur `now` exactement égal à un point | l'index de ce point |
| `hasDstTransition` sur une série de mars traversant le changement | vrai |
| `hasDstTransition` sur une série d'août | faux |

Le changement d'heure est la première cause de décalage d'une heure sur les axes de graphiques. Ces tests ne sont pas optionnels.

## 3. Tests d'intégration de la couche données

Avec MSW, aucun appel réseau réel.

### 3.1 Mapper Open-Meteo

| Cas | Attendu |
|---|---|
| réponse nominale 4 modèles | 4 séries, timeline commune, longueurs identiques |
| clé de variable suffixée | `temperature_2m_meteofrance_arome_france_hd` correctement résolue |
| AROME s'arrête à 36 h | points suivants à `value: null`, série de même longueur que la timeline |
| **`null` dans les précipitations** | reste `null`, jamais converti en 0 |
| modèle demandé absent du payload | bundle construit sans lui, `missingModels` le liste |
| payload sans bloc `hourly` | `HttpFailure` de type `malformed` |
| payload avec des longueurs de tableaux incohérentes | `malformed`, pas de bundle partiel silencieux |
| `past_days` renseigné | points passés marqués `provenance: 'estimated'` |
| points futurs | `provenance: 'forecast'` |
| `utc_offset_seconds` changeant en cours de série | timeline correcte, aucun point dupliqué ou perdu |

### 3.2 Client HTTP

| Cas | Attendu |
|---|---|
| HTTP 200 | `{ ok: true }` |
| HTTP 429 avec `Retry-After` | `rate_limited` avec `retryAfterMs` lu de l'en-tête |
| HTTP 429 sans en-tête | `rate_limited` avec un défaut |
| HTTP 500 | `server_error`, après épuisement des tentatives |
| HTTP 500 puis 200 | succès, une seule tentative supplémentaire consommée |
| échec réseau | `network` |
| dépassement du délai | `timeout` |
| `AbortSignal` déclenché | `aborted`, pas de nouvelle tentative |
| JSON invalide | `malformed` |
| backoff | délais croissants, jitter présent, vérifié avec horloge simulée |

### 3.3 Cache et file

| Cas | Attendu |
|---|---|
| deuxième appel dans le TTL | zéro requête réseau |
| appel après expiration du TTL | une requête |
| `forceRefresh` | requête même si le cache est valide |
| deux appels concurrents même clé | une seule requête, deux résolutions |
| deux appels concurrents clés différentes | deux requêtes |
| hors ligne avec cache expiré | données servies, `stale: true` |
| hors ligne sans cache | `HttpFailure` |
| `indexedDB` indisponible | repli mémoire, application fonctionnelle |
| migration de version 1 vers 2 | données conservées, aucune perte d'archive |
| préférences JSON corrompues | défauts retournés, aucune exception |
| préférences de version inconnue | défauts retournés |

### 3.4 Attribution de provenance

Un test dédié parcourt un bundle complet et vérifie qu'**aucune** `Measure` n'a une provenance absente ou incohérente avec sa position temporelle. C'est une garantie transverse, pas un détail de mapping.

## 4. Tests de composants

| Composant | Vérifications |
|---|---|
| Timeline | badge du modèle correct par tranche, marqueur de transition au bon index |
| Timeline | texture du trait conforme au niveau de confiance |
| Bande d'incertitude | s'élargit quand la dispersion augmente, absente si un seul modèle |
| Bandeau périmé | affiche l'horodatage, le contenu n'est pas grisé |
| Provenance | pastille pleine pour `observed`, creuse pour `estimated`, absente pour `forecast` |
| Fiabilité | affiche « en collecte » sous 10 échantillons |
| Favoris | réordonnancement persisté |
| Mode comparaison | 4 courbes, légende cohérente avec la convention de ce mode |
| Alertes | affiche « à l'ouverture » quand le support est `foreground-only` |
| Tous | quatre états `loading`, `ready`, `empty`, `error` rendus |
| Tous | navigation clavier complète, focus visible |
| Tous | `prefers-reduced-motion` supprime les transitions |
| Graphiques | table de données équivalente présente pour les lecteurs d'écran |

## 5. End-to-end

Sur Chromium, Firefox, WebKit, plus un viewport mobile 380 px.

1. Rechercher « Val de Virieu », la prévision s'affiche, le badge AROME est visible.
2. Ajouter le lieu aux favoris, recharger, le favori est là.
3. Ajouter un deuxième lieu, réordonner, recharger, l'ordre tient.
4. Basculer hors ligne, recharger, le contenu s'affiche avec l'horodatage.
5. Ouvrir une URL partagée `?lat=47.57&lon=-2.80`, le bon lieu se charge et est classé `coastal`.
6. Ouvrir le mode comparaison, quatre courbes présentes, fermer, revenir à l'état initial.
7. Le manifeste est valide, le service worker s'enregistre, l'application est installable.
8. Modifier une préférence d'unité, elle s'applique et persiste.

## 6. Non-régression

### 6.1 Régression fonctionnelle

Tout bug corrigé donne lieu à un test nommé d'après son identifiant, par exemple `regression/issue-42-null-precipitation.test.ts`. Le test doit être écrit **avant** le correctif et échouer. Un correctif dont le test passe avant est un correctif qui ne corrige rien de ce qui a été observé.

### 6.2 Régression de contrat d'API

Fixtures figées en dépôt sous `tests/fixtures/`, issues de réponses réelles anonymisées, avec la date de capture en en-tête de fichier.

Job CI hebdomadaire, séparé du build applicatif :

- appelle Open-Meteo pour un lieu de référence,
- compare la **forme** de la réponse aux fixtures : présence des clés, types, format des suffixes de modèle, identifiants de modèle toujours valides,
- ne compare pas les valeurs, qui changent évidemment,
- échoue et alerte en cas de divergence, sans casser les builds applicatifs en cours.

C'est le seul mécanisme qui protégera contre une évolution silencieuse d'Open-Meteo, dont dépend tout le produit.

### 6.3 Régression visuelle

Captures Playwright sur : accueil mobile, accueil desktop, détail horaire, mode comparaison, fiabilité, état hors ligne, état d'erreur. Chacune en thème clair et sombre.

Masquer uniquement les zones intrinsèquement variables : valeurs numériques, horodatages, tracés de courbes. Ne pas masquer les blocs entiers, sinon la capture ne teste plus la mise en page, qui est précisément ce qu'on protège.

Seuil de tolérance 0,2 % de pixels différents.

### 6.4 Régression de performance

Lighthouse CI, budgets bloquants :

```
performance      >= 90
accessibilite    >= 95
bonnes pratiques >= 90
PWA installable  oui
```

Budget de poids : JS initial inférieur à 200 ko gzip, CSS inférieur à 30 ko gzip. Dépassement égale échec du build.

### 6.5 Régression du service worker

Test Playwright dédié, indispensable dès le lot 3 :

1. Charger la version A, attendre l'activation du SW.
2. Déployer la version B sur le serveur de test.
3. Recharger : le bandeau de mise à jour apparaît.
4. Cliquer « Actualiser » : la version B est active.
5. Vérifier que les caches de la version A ont été supprimés.
6. Vérifier qu'il n'y a **pas** de boucle de rechargement.
7. Vérifier que le cache de tuiles a survécu au déploiement.

### 6.6 Régression d'accessibilité

`axe-core` exécuté sur chaque écran en e2e. Zéro violation de niveau `serious` ou `critical`. Le contraste des tokens de `DESIGN.md` est vérifié par un test unitaire dédié qui calcule les ratios à partir des variables CSS, pour que toute modification de palette échoue immédiatement.

## 7. Jeux de données de référence

À constituer dans `tests/fixtures/` :

- `nominal-summer.json`, `nominal-winter.json`
- `arome-truncated.json` : AROME s'arrête à 36 h, `null` ensuite
- `arome-missing.json` : modèle totalement absent
- `dst-spring.json` : série traversant le dernier dimanche de mars
- `dst-autumn.json` : série traversant le dernier dimanche d'octobre
- `all-dry.json` : précipitations nulles partout, pour le coefficient de variation
- `high-divergence.json` : écart de plus de 5 °C entre modèles
- `malformed-lengths.json` : tableaux de longueurs incohérentes
- `places.json` : Val de Virieu, Golfe du Morbihan, Chamonix, Beauce, Ajaccio

Chaque fixture porte en commentaire la date de capture et ce qu'elle est censée reproduire. Une fixture sans intention documentée finit par être modifiée pour faire passer un test, ce qui détruit sa valeur.

## 8. Commandes

```json
{
  "scripts": {
    "lint": "eslint . --max-warnings 0",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --coverage",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "e2e:visual": "playwright test tests/e2e/visual",
    "lighthouse": "lhci autorun",
    "verify": "npm run lint && npm run format:check && npm run typecheck && npm run test && npm run build && npm run e2e"
  }
}
```

Pipeline CI, dans cet ordre, chaque étape bloquante : `lint`, `format:check`, `typecheck`, `test`, `build`, `e2e`, `e2e:visual`, `lighthouse`.

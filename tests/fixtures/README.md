# Fixtures

Réponses Open-Meteo au format `/v1/forecast`, structurellement conformes à
l'API réelle (vérifiée le 2026-08-17), avec des valeurs synthétiques et une
fenêtre réduite à quelques heures pour rester lisibles. Chaque fichier ne
porte qu'une seule intention de test, décrite ici plutôt qu'en commentaire
JSON (le JSON n'en supporte pas).

| Fichier | Capturé / généré le | Reproduit |
|---|---|---|
| `nominal-summer.json` | 2026-08-17 | 4 modèles présents, aucune valeur `null`, cas nominal. |
| `arome-truncated.json` | 2026-08-17 | AROME passe à `null` à partir d'un certain index (fin d'échéance), les trois autres modèles continuent. |
| `arome-missing.json` | 2026-08-17 | AROME est entièrement absent des clés `hourly` (modèle non couvert pour ce point). |
| `dst-spring.json` | 2026-08-17 | La timeline traverse le passage à l'heure d'été du 29/03/2026 : l'heure 02:00 est absente, la série saute directement à 03:00. |
| `dst-autumn.json` | 2026-08-17 | La timeline traverse le passage à l'heure d'hiver du 25/10/2026 : l'heure 02:00 apparaît deux fois. |
| `malformed-lengths.json` | 2026-08-17 | La série `temperature_2m` d'ARPEGE n'a que 3 valeurs pour une timeline de 6 heures. |
| `all-dry.json` | 2026-08-17 | Précipitations nulles chez les 4 modèles à chaque heure : coefficient de variation à 0, pas de `NaN`, confiance élevée. |
| `high-divergence.json` | 2026-08-17 | Écart de température de 8 à 9 °C entre modèles à chaque heure (offsets fixes par modèle) : confiance basse, bande d'incertitude large. |

Régénérées par un script ad hoc non versionné (même approche que
`scripts/generate-coastline.py`) ; à reconstruire à la main si une nouvelle
fixture est nécessaire, en gardant le format ci-dessus.

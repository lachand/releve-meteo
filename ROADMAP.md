# ROADMAP.md

Plan de refonte « Relevé 2 » : du relevé de prévisions à un véritable carnet de météorologue, qui choisit, justifie et vérifie. Ce document complète `BACKLOG.md` (lots 0 à 8) sans le remplacer : chaque phase ci-dessous est découpée en tâches cochables, avec ses critères de sortie.

## 0. Constat de départ (2026-09-28)

Déjà livré : cascade fixe AROME, ARPEGE, ICON-EU, GFS par échéance ; bande d'incertitude hachurée ; confiance par texture de trait ; comparaison ; pression, rose des vents, radar RainViewer ; PWA hors ligne ; favoris.

Limites structurelles identifiées :

| Limite                                                                                        | Conséquence                                                                                           |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Cascade figée par échéance, identique partout en France                                       | Aucun choix « meilleur modèle pour ce lieu ». La justification se réduit à « l'échéance est courte ». |
| 4 modèles seulement, 7 jours                                                                  | Pas d'ECMWF (référence mondiale), pas d'ICON-D2, pas de prévision longue ni probabiliste.             |
| Aucune vérification contre le réel (`reliability.ts` vide)                                    | Le choix du modèle ne s'améliore jamais.                                                              |
| Variables limitées (pas de CAPE, visibilité, neige, iso 0 °C, humidité, probabilité de pluie) | Orages, neige, brouillard, verglas non caractérisés.                                                  |
| `weather_code` absent pour AROME HD                                                           | Aucune condition affichée à courte échéance.                                                          |
| Condition météo en texte seul, pas de pictogramme                                             | L'utilisateur demande des icônes de prévision.                                                        |
| Une seule longue page                                                                         | Difficile de naviguer entre maintenant, heure par heure, jours, carte, fiabilité.                     |

## 1. Principes directeurs (inchangés, renforcés)

1. Transparence de provenance : chaque valeur dit quel modèle la produit et avec quelle confiance.
2. Le choix automatique du modèle est **explicable** : score chiffré, critères listés, alternatives présentées avec leurs points forts et faibles.
3. La vérification contre le réel est **honnête** : on dit contre quoi on compare (analyse Open-Meteo, étiquetée `estimated`, ou station, étiquetée `observed`), sur combien de jours, à quelle échéance.
4. Données exclusivement gratuites et sans clé par défaut : Open-Meteo (forecast, ensemble, previous-runs, air-quality, marine), RainViewer, OpenStreetMap. Les sources à clé (Infoclimat, Vigilance Météo-France) restent optionnelles.

## 2. Direction artistique : « le carnet du météorologue »

Évolution de `DESIGN.md`, pas une rupture : l'instrument de mesure devient un **carnet d'observation** relié, tenu à la plume.

- **Papier** : fond crème chaud (papier de registre), grille millimétrée conservée, filets rouges de marge (« registre » à l'ancienne), en sombre : encre de nuit sur papier bleu-noir.
- **Typographie** : titres en serif à contraste (famille « à l'ancienne », auto-hébergée, licence OFL), valeurs en IBM Plex Mono (conservée : lisibilité des chiffres), corps en Plex Sans.
- **Icônes de prévision** : pictogrammes SVG inspirés des **symboles synoptiques de l'OMM** (ceux qu'on trace sur une carte d'observation : point de pluie, astérisque de neige, triangle d'averse, éclair en « R » d'orage, traits horizontaux de brouillard, cercle de nébulosité en octas). C'est le vocabulaire graphique exact d'un carnet de météorologue : il satisfait la demande d'icônes sans trahir le principe « pas de soleil-nuage stylisé ». Tracé au trait, une couleur (encre), lisibles à 16 px.
- **Tampons et annotations** : le choix du modèle apparaît comme une mention tamponnée (« MODÈLE RETENU : AROME ») avec une note manuscrite de justification.
- **Couleur** : toujours réservée aux modèles (Okabe-Ito) ; un seul accent d'encre rouge pour les alertes et la marge.

Mise à jour de `DESIGN.md` §5 : l'encodage « Condition météo » devient « symbole synoptique OMM + étiquette texte ». Le texte reste obligatoire (accessibilité, lecture sans légende).

### Phase Z : design system « carnet » (livrée avant les nouvelles vues)

**Palette, clair (papier de registre)**

| Jeton            | Valeur    | Rôle                                  |
| ---------------- | --------- | ------------------------------------- |
| `--papier`       | `#F3EEE3` | fond crème, papier vergé              |
| `--papier-haut`  | `#FBF8F1` | feuillets, cartes                     |
| `--grille`       | `#D9CFBC` | filets, grille millimétrée sépia      |
| `--encre`        | `#1F2A36` | encre bleu-noir de stylo-plume        |
| `--encre-faible` | `#5E6670` | annotations, unités                   |
| `--marge`        | `#B8483A` | filet de marge rouge, tampon, alertes |
| `--tampon`       | `#2F5D8A` | tampon bleu « modèle retenu »         |

Sombre (« carnet de nuit ») : papier `#141A21`, encre `#E6DFD0`, marge `#E0715F`. Couleurs de modèle Okabe-Ito conservées (2 modèles ajoutés : ECMWF `#6B6B00` olive, ICON-D2 `#0072B2`-clair, AROME France bleu désaturé), contrastes AA vérifiés.

**Typographie**

- Titres et grands chiffres de synthèse : serif à contraste de style gravure (Libre Caslon Display / EB Garamond, OFL, auto-hébergée, sous-ensemble latin étendu).
- Valeurs : IBM Plex Mono, chiffres tabulaires (inchangé).
- Annotations « manuscrites » (justification, notes du météorologue) : italique de la serif, jamais une fonte cursive fantaisie.
- Étiquettes d'axe et en-têtes de colonne : petites capitales espacées.

**Composants et ornements**

- [x] **Z1.** Tokens (`tokens.css`) : nouvelle palette clair/sombre, polices, ombres de feuillet très légères (papier posé, pas de carte flottante), rayon 2 px conservé.
- [x] **Z2.** Fond : grille millimétrée sépia, filet de marge rouge vertical à gauche sur desktop, grain papier en SVG `feTurbulence` à opacité 3 %, désactivé à l'impression.
- [x] **Z3.** En-tête « page de registre » : nom du lieu en serif, ligne de métadonnées en petites capitales (département · altitude · terrain · coordonnées), date du relevé à droite façon « Relevé du lundi 28 septembre 1926 » (année réelle).
- [x] **Z4.** Jeu de **symboles synoptiques OMM** en SVG inline (`src/ui/symbols/`) : ciel clair, nébulosité en octas (cercle rempli par quarts), bruine, pluie (points), averse (triangle), neige (astérisque), grêle, orage, brouillard, brume, vent fort (hampe à barbules), gel, jour/nuit. Composant `<WeatherSymbol code cloudCover isDay size />` avec `aria-label` français. Planche de référence dans la page « Sources et légende ».
- [x] **Z5.** Tampon « MODÈLE RETENU » : cartouche encadré double filet, légèrement incliné (-2°), couleur `--tampon`, avec le nom du modèle et la note de justification en italique à côté.
- [x] **Z6.** Onglets de carnet (intercalaires) pour la navigation : Aujourd'hui, Heure par heure, 15 jours, Carte, Modèles, Fiabilité. Barre fixe en bas sur mobile, onglets en haut sur desktop.
- [x] **Z7.** Graphiques Chart.js harmonisés : grille sépia, axes en petites capitales, trait d'encre légèrement épais, bande hachurée conservée (signature), histogrammes en barres hachurées pour le prévu et pleines pour l'observé.
- [x] **Z8.** Micro-interactions sobres : changement d'onglet en fondu 150 ms, aucune animation décorative, `prefers-reduced-motion` respecté.
- [x] **Z9.** Icône d'application et `mark.svg` redessinés (cercle de station synoptique + plume).
- [x] **Z10.** Revue visuelle : captures Playwright clair/sombre, mobile 380 px / desktop 1280 px, relues avant validation ; contraste AA vérifié par un test sur `tokens.css` (`src/ui/styles/contrast.test.ts`, texte 4,5:1, tracés 3:1, deux thèmes).

**Maquette de l'accueil (mobile)**

```
┌──────────────────────────────────┐
┃ VIRIEU                    ☆  ⚙  ┃  serif, filet rouge de marge à gauche
┃ ISÈRE · 468 M · PLATEAU          ┃  petites capitales
┃ Relevé du lundi 28 septembre     ┃  italique
├──────────────────────────────────┤
┃  ◐  14,2 °C    ╔═══════════════╗ ┃  symbole OMM + valeur Mono
┃     Peu nuageux ║MODÈLE RETENU ║ ┃  tampon incliné
┃  ressenti 13,1  ║    AROME     ║ ┃
┃                 ╚═══════════════╝ ┃
┃  « Maille 1,3 km adaptée au       ┃  note manuscrite (italique)
┃    relief ; erreur mesurée 0,9 °C ┃
┃    sur 21 j, la plus basse ici. » ┃
├──────────────────────────────────┤
┃ 12h  13h  14h  15h  16h  17h  →  ┃  ruban horaire
┃  ◐    ●    ▽    ▽    ⌁    ◑      ┃  symboles synoptiques
┃ 14°  15°  15°  13°  12°  12°     ┃
┃  0   0   1,2  3,4  0,8   0  mm   ┃
├──────────────────────────────────┤
┃ [Auj.] [Heures] [15 j] [Carte] … ┃  intercalaires
└──────────────────────────────────┘
```

## 3. Refactoring préalable

- [x] **R1. Registre de modèles** (`domain/models.ts`) : un catalogue déclaratif par modèle (identifiant Open-Meteo, producteur, résolution, portée en heures, domaine géographique, variables natives manquantes, forces, faiblesses, fréquence de mise à jour). Remplace les `switch` épars (`modelCascade.ts`, `modelExplanation.ts`, `modelPresentation.ts`).
- [x] **R2. Élargir `ModelId`** : `arome` (HD 1,3 km), `arome_france` (2,5 km, champs complets dont nébulosité), `icon_d2`, `arpege`, `icon_eu`, `ecmwf` (IFS 0,25°), `gfs`. Tout code qui énumère les modèles lit le registre.
- [x] **R3. Élargir `HourlyPoint`** : humidité relative, probabilité de précipitation, neige, CAPE, visibilité, altitude de l'isotherme 0 °C, rafales déjà présentes, température ressentie. Toujours `Measure`, toujours `null` si absent.
- [x] **R4. Couche de navigation** : `App.tsx` éclate en vues (`Aujourd'hui`, `Heure par heure`, `15 jours`, `Carte`, `Modèles`, `Fiabilité`), onglets accessibles, état dans l'URL (`?vue=`).
- [x] **R5. IndexedDB v2** : magasin `datasets` (cache générique à expiration), migration incrémentale testée (jamais de suppression de base).

## 4. Fonctionnalités

### Phase A : choix automatique du meilleur modèle, justifié

- [x] **A1.** `domain/modelSelection.ts` : score par modèle et par tranche d'échéance, pur et testé, combinant :
  - un **a priori** (résolution effective, adéquation au terrain : montagne et côte favorisent la maille fine ; couverture du domaine ; échéance dans la portée) ;
  - la **performance locale mesurée** (erreur absolue moyenne à J+1/J+2 contre le réel, phase C), pondérée par le nombre d'échantillons (retrait bayésien vers l'a priori) ;
  - la **disponibilité** effective dans la réponse.
- [x] **A2.** Cascade dynamique : `buildCascade` accepte un classement par tranche plutôt que l'ordre figé. La transition reste visible (règle non négociable 6).
- [x] **A3.** Justification structurée : liste de critères avec leur contribution (« maille 1,3 km adaptée au relief : +2 », « erreur mesurée 0,9 °C sur 21 jours : meilleure du lieu »). Rendue en carnet annoté.
- [x] **A4.** Choix manuel : sélecteur « Modèle de référence » (auto par défaut), fiche de chaque modèle avec **points forts / points faibles**, portée, résolution, producteur, score local. Persisté par lieu.

### Phase B : prévisions riches

- [x] **B1.** Heure par heure : ruban horaire avec symboles synoptiques, température, pluie (mm + probabilité), vent (flèche + rafales), sur 48 h puis 3 h par 3 h jusqu'à J+4.
- [x] **B2.** Prévision longue 15 jours via l'**API d'ensemble Open-Meteo** (ECMWF ENS, ICON-EPS, GFS-ENS) : diagramme en boîtes (min, P10, médiane, P90, max) de température, probabilité de pluie > 1 mm, dispersion croissante visible. Au-delà de J+7, uniquement probabiliste.
- [x] **B3.** Pluie : histogramme horaire par modèle, cumul 24 h / 7 j, probabilité, nowcast 15 min AROME (`minutely_15`) sur 2 h (« pluie dans 25 min »).
- [x] **B4.** Orages et phénomènes : indice d'orage à partir de CAPE + code WMO + rafales ; neige (limite pluie-neige via isotherme 0 °C), gel, verglas, brouillard (visibilité), canicule, vent fort. Un panneau « Phénomènes » liste chaque risque avec ses critères chiffrés.
- [x] **B5.** Condition AROME HD reconstruite : quand `weather_code` est `null` pour AROME HD, le demander à `arome_france` (2,5 km, même producteur, formule complète), **étiqueté comme tel** dans l'infobulle. Consigné comme écart.
- [x] **B6.** Diagrammes : météogramme complet (température, point de rosée, nébulosité en octas, pluie, vent), histogramme de précipitations, courbe de pression, rose des vents, jauge UV, qualité de l'air et pollens (API air-quality CAMS), éphéméride soleil.

### Phase C : vérification contre le réel

- [x] **C1.** Client **Previous Runs API** Open-Meteo : pour chaque modèle, prévisions émises J-1, J-2, J-3 pour les 30 derniers jours. Rend la vérification **immédiate** dès la première visite, sans attendre 90 jours d'archive.
- [x] **C2.** Référence « réel » : série `past_days` de la meilleure analyse disponible, étiquetée `estimated` ; stations Infoclimat étiquetées `observed` si une clé est fournie.
- [x] **C3.** `domain/reliability.ts` : MAE, biais, RMSE, taux de réussite pluie/sec (score de Heidke simplifié) par modèle, variable et échéance. Tests exhaustifs.
- [ ] **C4.** ~~Archive locale continue~~ : inutile, la Previous Runs API conserve les prévisions jusqu'à J-7 sur des mois (BACKLOG.md, Écarts constatés).
- [x] **C5.** Écran Fiabilité : classement par variable et échéance, barres horizontales, courbe erreur en fonction de l'échéance, mention « calcul local », état « en collecte ».
- [x] **C6.** Boucle fermée : les scores alimentent A1.
- [x] **C7.** Contrôle au dernier relevé : la mesure de la station face à chaque modèle, station à station.

### Phase D : carte

- [x] **D1.** Carte radar animée (boucle des 2 dernières heures + nowcast RainViewer), lecture pas à pas, horodatage.
- [x] **D2.** Marqueurs des favoris avec symbole et température du modèle retenu.
- [x] **D3.** Carte de prévision 48 h (pluie et température du modèle retenu, grille de 12,5 km), fond de carte sépia commun.

### Phase E : qualité

- [x] **E1.** Tests unitaires domaine à 100 % sur les nouveaux modules.
- [x] **E2.** Tests composants des nouvelles vues, quatre états.
- [x] **E3.** e2e mis à jour (sélection de modèle, onglets, fiabilité), sans réseau.
- [ ] **E4.** Captures de régression visuelle relues : relues à la main à chaque livraison ; pas encore de comparaison automatique d'images.

## 5. Ordre d'exécution

1. R1, R2, R3 (socle domaine et données), puis R5.
2. A1 à A4 et C1 à C3 en parallèle (le score local alimente la sélection) ; en parallèle, Z1 à Z5 (tokens, polices, fond, en-tête, symboles OMM, tampon).
3. Z6 et Z7 (navigation, graphiques harmonisés), puis R4 et vues B1 à B6.
4. C4, C5, D1, D2.
5. E1 à E4, mise à jour de `README.md`, `DESIGN.md`, `ARCHITECTURE.md`, `BACKLOG.md`.

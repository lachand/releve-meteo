# DESIGN.md

## 1. Direction

**Sujet** : le carnet d'un météorologue. Un instrument de mesure tenu à la plume, pas une application météo grand public. L'audience sait déjà ce qu'est un modèle de prévision, ou vient l'apprendre. Le travail de la page est de rendre lisible ce qui est mesuré, ce qui est estimé, ce qui est incertain, et quel modèle parle.

**Le vocabulaire visuel vient du monde du sujet** : papier de registre quadrillé, filet de marge rouge, encre bleu-noir de stylo-plume, pictogrammes du temps dessinés au trait d'encre et rehaussés de lavis discrets, flèches de vent, tampon d'encre, annotations en italique. Pas de dégradés de ciel, pas de photo de fond, pas d'icônes en relief ou animées. L'interface a l'aspect d'un relevé, parce que c'est ce qu'elle est. (Évolutions du 2026-09-28 : pictogrammes demandés à la place de l'étiquette texte seule ; puis les symboles synoptiques de l'OMM, jugés difficilement compréhensibles par l'utilisateur, remplacés par des pictogrammes lisibles sans légende, et les barbules de vent par des flèches, voir section 5.)

**Élément signature** : la bande d'incertitude en hachures diagonales. Là où toutes les applications météo tracent une courbe unique et confiante, celle-ci trace la courbe du modèle retenu sur une bande hachurée représentant l'écart entre modèles. Quand les modèles s'accordent, la bande disparaît presque. Quand ils divergent, elle s'ouvre visiblement. L'incertitude devient une forme, pas un badge. Le même principe vaut pour l'éventail de l'ensemble ECMWF au-delà de dix jours.

**Deuxième signature** : le tampon « MODÈLE RETENU ». Le nom du modèle est aussi visible que la température, à la couleur du modèle, accompagné d'une note manuscrite qui dit pourquoi ce modèle (maille, terrain, erreur mesurée ici).

**Risque assumé** : la confiance n'est pas encodée par la couleur. La couleur appartient exclusivement au modèle. La confiance est encodée par la **texture du trait**, comme sur un relevé tracé à la main : trait plein pour élevée, tireté pour moyenne, pointillé pour faible. Une légende permanente en bas du graphique rend l'apprentissage immédiat.

## 2. Palette

Papier crème et encre de plume en clair, « carnet de nuit » (encre claire sur papier bleu-noir) en sombre. Les couleurs de tracé des modèles sont dérivées de la palette Okabe-Ito, distinguable pour les trois formes principales de daltonisme. Contraste d'au moins 3:1 sur le papier pour les éléments graphiques (WCAG 1.4.11) ; un nom de modèle composé à sa couleur l'est en grand corps (22 px gras et plus), sinon il est à l'encre avec une pastille de couleur.

```css
:root {
  /* Surfaces : papier de registre */
  --papier:        #F2EDE2;  /* fond, papier vergé crème */
  --papier-haut:   #FBF8F1;  /* feuillets, panneaux */
  --papier-creux:  #E9E2D3;  /* champs, zones en retrait, squelettes */
  --grille:        #D6CCB8;  /* filets, grille sépia */
  --grille-faible: #E4DCCB;  /* grille secondaire */

  /* Encre */
  --encre:         #1C2733;  /* encre bleu-noir */
  --encre-faible:  #5B6570;  /* annotations, unités */
  --marge:         #AC4336;  /* filet de marge rouge, onglet actif */

  /* Tracés de modèle */
  --arome:         #005B8F;  /* bleu profond */
  --arome-france:  #2F7FB5;  /* bleu ciel */
  --icon-d2:       #3B7D4F;  /* vert tendre */
  --arpege:        #B35300;  /* vermillon foncé */
  --icon-eu:       #00664B;  /* vert bleuté */
  --ecmwf:         #7D6300;  /* ocre */
  --gfs:           #9B4E7E;  /* pourpre */

  /* Signaux */
  --alerte:        #A32020;  /* vigilance, seuil franchi */
  --observe:       #1C2733;  /* provenance mesurée : encre pleine */
  --estime:        #5B6570;  /* provenance estimée : encre affaiblie */
  --risque-faible: #6D6455;  /* niveaux de risque : intensité d'encre */
  --risque-modere: #9A4B21;
  --risque-fort:   #A32020;

  /* Vigilance Météo-France : couleurs officielles, toujours avec le mot */
  --vigilance-verte:  #31AA35;
  --vigilance-jaune:  #F5D63D;
  --vigilance-orange: #EC8A19;
  --vigilance-rouge:  #D21C1C;
}
```

Mode sombre, activé par `prefers-color-scheme` et surchargeable dans les réglages : papier `#131920`, feuillet `#1A222B`, encre `#E8E1D2`, encre faible `#A39A8B`, marge `#E0715F`, modèles éclaircis (`--arome #5AB0E8`, `--arome-france #8FC6EA`, `--icon-d2 #7FC78F`, `--arpege #EE9150`, `--icon-eu #3FBF98`, `--ecmwf #D9B640`, `--gfs #D08FB8`). Valeurs complètes dans `src/ui/styles/tokens.css`, seule source de vérité.

Contraste : toute paire texte sur fond atteint AA (4,5:1 pour le corps, 3:1 pour le texte large).

## 3. Typographie

Quatre rôles.

```css
:root {
  --font-titre:   'EB Garamond', 'Iowan Old Style', Georgia, serif;  /* titres, annotations */
  --font-display: 'IBM Plex Sans Condensed', system-ui, sans-serif;  /* étiquettes, capitales */
  --font-corps:   'IBM Plex Sans', system-ui, sans-serif;            /* texte courant */
  --font-donnee:  'IBM Plex Mono', ui-monospace, monospace;          /* valeurs */
}
```

- **Titres** (nom du lieu, titres de feuillet) en EB Garamond 600 : le serif à contraste des registres imprimés.
- **Annotations du météorologue** (justification du modèle, notes, états calmes) en EB Garamond italique. Jamais une fonte cursive fantaisie.
- **Règle centrale inchangée** : toute valeur mesurée ou prévue est composée en `--font-donnee`, avec `font-variant-numeric: tabular-nums`, à un corps supérieur à son étiquette. Les chiffres ne bougent pas quand la valeur change.
- Étiquettes d'axe, surtitres et en-têtes de colonne en `--font-display`, capitales, interlettrage large.

Pas : `--pas-xs` 11 px, `--pas-s` 13 px, `--pas-m` 16 px, `--pas-l` 22 px, `--pas-xl` 40 px, `--pas-xxl` 64 px (température du moment).

Chargement : `woff2` auto-hébergés dans `public/fonts/`, `font-display: swap`, sous-ensemble latin (qui couvre le français, « œ » compris), précachés par le service worker. Pas de CDN de polices : cela casserait le hors ligne.

## 4. Grille et espacement

Unité de 4 px (`--esp-1` à `--esp-12`), `--rayon` 2 px (un relevé, pas une carte de visite), `--largeur-max` 1180 px. Points de rupture 640 px et 1024 px, conception mobile d'abord.

Le fond de page est un papier de registre : grille sépia (pas majeur 40 px, mineur 8 px) et grain très léger (bruit SVG à 5 %), retirés à l'impression. Sur grand écran, un filet de marge rouge vertical court à gauche de la colonne. Le contenu est posé sur des **feuillets** (`Section`) : papier plus clair, filet d'encre sous le titre, ombre de papier à peine perceptible.

## 5. Encodages visuels, table de référence

Cette table est normative. Aucun composant ne doit inventer un autre encodage.

| Information | Encodage | Jamais |
|---|---|---|
| Modèle | Couleur du tracé ; en texte, pastille de couleur ou tampon en grand corps | Autre chose que la couleur |
| Modèle retenu à l'instant présent | Tampon encadré double filet, incliné de -2,5°, « MODÈLE RETENU » ou « CHOIX MANUEL » | Badge anonyme |
| Justification du choix | Note en italique, une phrase par critère réel du score | Formule générique |
| Confiance | Texture du trait : plein, tireté 6-3, pointillé 2-3 | Couleur, emoji, feu tricolore |
| Dispersion inter-modèles, éventail d'ensemble | Bande hachurée diagonale à 45° | Aplat translucide |
| Provenance observée | Encre pleine, pastille circulaire pleine | Vert |
| Provenance estimée | Encre affaiblie, pastille circulaire creuse | Rouge, orange |
| Provenance prévue | Encre normale, sans pastille | Pastille |
| Donnée complétée par un autre modèle | Mention « Complété, faute de donnée chez X : champ : Y » | Complément silencieux |
| Transition de modèle | Filet vertical tireté (graphiques, ruban horaire, frise) + nom du nouveau modèle | Aucun marqueur |
| Condition météo (code WMO) | Pictogramme au trait d'encre (soleil, lune la nuit, nuage, gouttes, flocons, éclair, brouillard), lavis `--picto-*` discrets, intensité par le nombre de gouttes ou de flocons, + étiquette texte française (visible ou accessible) | Icône sans texte, icône en relief ou animée, soleil en pleine nuit |
| Nébulosité | Pictogramme du ciel affiné par la nébulosité de l'heure (soleil seul, soleil et petit nuage, nuage devant le soleil, deux nuages) ; valeur chiffrée en % dans « Maintenant » | Huitièmes (octas) sans explication |
| Vent | Flèche qui pointe là où va le vent, trait plus épais quand il forcit (seuils 20, 40, 60 km/h), cercle si calme (moins de 5 km/h) + vitesse chiffrée + « du SO » écrit (d'où il vient) | Flèche sans direction écrite, flèche animée, barbule sans explication |
| Rose des vents | Un pétale par secteur, qui pointe d'où vient le vent, long du nombre d'heures, découpé par force (lavis sépia `--rose-1` à `--rose-4`, mêmes seuils que la flèche) ; calme au centre ; couronne de boussole graduée ; phrase de synthèse (« Vent dominant du sud : 34 heures sur 48, surtout faible ») et modèles des heures | Graphique polaire générique, aplats translucides sans repère |
| Niveau de risque d'un phénomène | Intensité d'encre (`--risque-*`) + mot « faible », « modéré », « fort » | Feu tricolore |
| Vigilance Météo-France | Bandeau pleine largeur, filet `--alerte`, en tête du relevé ; pastille cerclée d'encre à la couleur officielle du niveau (`--vigilance-*`) + mot « jaune », « orange », « rouge » + source et heure du bulletin | Icône seule, couleur sans mot, vigilance présentée comme un calcul de Relevé |
| Donnée périmée | Bandeau d'horodatage en haut du contenu | Griser le contenu |

Condition météo : le code WMO est traduit en pictogramme (`src/ui/symbols/WeatherSymbol.tsx`, jour ou nuit selon `isDay`) et en étiquette (`src/ui/weatherCodePresentation.ts`). Le symbole n'est jamais la seule information : il porte l'étiquette comme nom accessible, ou l'étiquette est affichée à côté. Un code absent ou inconnu n'affiche aucun symbole plutôt qu'un symbole par défaut trompeur. Une planche de légende complète est présente dans l'onglet « Heure par heure ».

## 6. Maquettes

### 6.0 Structure

Un carnet à intercalaires. En-tête « page de registre » (marque, recherche, favori, réglages ; puis nom du lieu en serif, fil département · altitude · terrain · coordonnées, date du relevé en italique), puis six onglets collants (sous 640 px, une barre fixe en bas de l'écran, à portée du pouce, avec un pictogramme au trait et un libellé court par section), puis la vue active. L'onglet ouvert est dans l'URL (`?vue=`), avec le lieu (`?lat=&lon=&nom=&alt=&dep=`).

| Onglet | Contenu |
|---|---|
| Aujourd'hui | Maintenant (symbole, température, relevé chiffré, tampon, justification) ; pluie au quart d'heure (2 h) ; phénomènes sur 72 h ; ruban 24 h ; tendance 5 jours ; repères du jour ; qualité de l'air et pollens |
| Heure par heure | Température 48 h et bande d'incertitude ; précipitations 48 h ; ruban 72 h ; ruban 3 h jusqu'à 10 jours ; pression ; rose des vents ; légende des symboles |
| 15 jours | Liste de 10 jours (modèle retenu chaque jour) ; éventail de l'ensemble ECMWF sur 15 jours |
| Radar | Carte OpenStreetMap et radar RainViewer |
| Modèles | Tampon et justification ; frise de la cascade ; classement chiffré par critère ; choix manuel avec points forts et faibles ; comparaison superposée |
| Fiabilité | Référence (station ou réanalyse) ; erreurs par modèle et par échéance ; courbe de l'erreur selon l'échéance |

Seule la vue « Aujourd'hui » est dans le paquet initial ; les autres sont chargées à la demande.

### 6.1 Aujourd'hui, mobile (largeur 390)

```
┌──────────────────────────────────┐
│ ▣ Relevé                   ☆  ⚙  │
│ [ Chercher une commune ]    ⌖    │
│──────────────────────────────────│
│ Lyon                             │  EB Garamond
│ RHÔNE · 170 M · PLAINE · 45,8° N │  petites capitales
│ Relevé du lundi 28 septembre     │  italique
├──────────────────────────────────┤
│ [AUJ.] [HEURES] [15 J] [RADAR] … │  intercalaires
├──────────────────────────────────┤
│ MAINTENANT                       │
│  ◍  29,0 °C                      │  symbole OMM + valeur Mono
│     Couvert · ressenti 26 °C     │
│ VENT ⌐ S 18   RAFALES 37 km/h    │
│ HUMIDITÉ 29 % ROSÉE 9,2 °C       │
│┃ ╔═════════════════╗             │  filet de marge rouge
│┃ ║  MODÈLE RETENU  ║             │  tampon incliné
│┃ ║      AROME      ║             │
│┃ ╚═════════════════╝             │
│┃ AROME retenu pour ce lieu…      │  note italique
│┃ • Plus juste ici sur la temp.…  │
│┃ Complété, faute de donnée chez  │
│┃ AROME : nébulosité : AROME Fr.  │
│┃ Pourquoi ce modèle ?            │
├──────────────────────────────────┤
│ Pluie au quart d'heure           │
│ Pas de pluie attendue d'ici 2 h  │
├──────────────────────────────────┤
│ Phénomènes à surveiller          │
├──────────────────────────────────┤
│ HEURE  16h 17h 18h ┊ 00h …  →    │  ruban défilant
│ TEMPS   ◍   ◍   ◔  ┊  ●         │
│ °C     29° 29° 28° ┊ 23°         │
│ VENT    ↑   ↑   ↗  ┊  ↗          │  flèches
│ MODÈLE AROME       ┊ ICON-EU     │  filet tireté = transition
└──────────────────────────────────┘
```

### 6.2 Modèles, desktop (largeur 1180)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ SÉLECTION · Quel modèle, et pourquoi                                       │
│ ╔══════════════╗  AROME retenu pour ce lieu et cette échéance.            │
│ ║MODÈLE RETENU ║  • Maille de 1,3 km : en plaine, la maille compte…       │
│ ║    AROME     ║  • Plus juste ici sur la température : 1,2 °C…           │
│ ╚══════════════╝  − Moins juste ici sur le vent : 4,5 km/h…               │
│                   Suivant : ICON-D2, 7,9 points contre 9,2.               │
│ Modèle retenu à chaque échéance                                            │
│ [ AROME      ┊ ICON-EU                ┊ ECMWF IFS                      ]  │
│  lun. 28     mar. 29    mer. 30    jeu. 1 …                               │
├────────────────────────────────────────────────────────────────────────────┤
│ RANG  MODÈLE        SCORE              MAILLE  PORTÉE  ERREUR J+1          │
│ 1     ● AROME       9,2 ███████▒░      1,3 km  48 h    1,2 °C              │
│ 2     ● ICON-D2     7,9 ██████▒▒░      2,2 km  48 h    1,1 °C              │
│ …     █ maille et terrain  ▒ moyenne échéance  ░ erreur mesurée ici        │
├────────────────────────────────────────────────────────────────────────────┤
│ ( ) Automatique  RECOMMANDÉ    ( ) ● AROME  Météo-France · 1,3 km · 48 h   │
│                                    + Maille la plus fine…                  │
│                                    − Portée courte, 48 h au plus           │
└────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Mode comparaison

```
┌────────────────────────────────────────────────────────────────────────────┐
│  COMPARER LES MODÈLES                                                      │
│  Variable  [ température ▾ ]     Échéance  [ 72 h ▾ ]                      │
│ 22°┤                          ╱‾‾‾╲                                        │
│    │                    ╱━━━━╱     ╲━━━                                    │
│ 18°┤        ╱‾‾‾╲ ╱‾‾‾‾╱  ╱┅┅┅┅╲                                          │
│    │  ━━━━━╱     ╳      ╳┅       ┅┅┅┅                                     │
│ 14°┤ ╱           ┅╲    ╱  ╲···········                                    │
│    └──┬──────┬──────┬──────┬──────┬──────┬──────                          │
│  ━━ AROME jusqu'à 48 h   ╱╲ ARPEGE jusqu'à 102 h   ┅┅ ECMWF IFS …          │
│  Écart maximal 4,8 °C mercredi 15h.                                        │
└────────────────────────────────────────────────────────────────────────────┘
```

En mode comparaison, la texture du trait sert à identifier le modèle en complément de la couleur (une texture par modèle), puisque la confiance n'a plus de sens quand on regarde chaque modèle séparément. Le changement de convention est explicite dans la légende.

### 6.4 Fiabilité locale

```
┌──────────────────────────────────────────────────────────┐
│ FIABILITÉ LOCALE · Qui a vu juste à Lyon                 │
│ ● Température : mesures de la station Lyon / Bron        │
│   (10,2 km, +30 m), du 29 août au 27 septembre.          │
│ ○ Précipitations : réanalyse ERA5, une estimation…       │
│ ERA5 avantage ECMWF et pénalise les modèles fins…        │
├──────────────────────────────────────────────────────────┤
│ Température   erreur moyenne en °C                       │
│ MODÈLE      J+1   J+2   J+3   J+5   J+7   BIAIS J+1      │
│ AROME       1,2    –     –     –     –    +0,8 °C        │
│ ICON-D2     1̲,̲1̲    –     –     –     –    +0,1 °C        │
│ ECMWF IFS   1,4   1,5   1,4   1̲,̲8̲   2̲,̲2̲   +0,0 °C        │
│ [ courbe de l'erreur selon l'échéance ]                  │
├──────────────────────────────────────────────────────────┤
│ Calcul effectué sur cet appareil ; ces scores alimentent │
│ directement le choix automatique du modèle.              │
└──────────────────────────────────────────────────────────┘
```

Le meilleur modèle de chaque colonne est souligné d'un trait de marge.

### 6.5 États non nominaux

```
HORS LIGNE                          ERREUR
┌────────────────────────┐          ┌──────────────────────────┐
│ Hors ligne · Relevé du │          │ Prévision indisponible.  │
│ 28/09 à 15h27          │          │ Le service de prévision  │
├────────────────────────┤          │ Open-Meteo ne répond pas.│
│  [ contenu normal,     │          │ [ Réessayer ]            │
│    non grisé ]         │          └──────────────────────────┘
└────────────────────────┘

AUCUN LIEU                          VÉRIFICATION INDISPONIBLE
┌────────────────────────┐          ┌──────────────────────────┐
│ Aucun lieu au carnet.  │          │ Vérification indisponible│
│ Cherchez une commune…  │          │ Les prévisions restent   │
└────────────────────────┘          │ affichées, choisies sur  │
                                    │ la maille et l'échéance. │
                                    └──────────────────────────┘
```

Le contenu périmé n'est jamais grisé. Griser suggère « désactivé ». L'horodatage suffit à dire ce qu'il en est. Chaque jeu secondaire (ensemble, vérification, qualité de l'air, nowcast) a ses propres états : son absence ne bloque jamais la prévision principale.

## 7. Rédaction de l'interface

- Nommer les choses par ce que l'utilisateur reconnaît. « Relevé du 17/08 à 14h », pas « cache hit, TTL expired ».
- Le bouton dit ce qui se passe. « Enregistrer ce lieu » puis notification « Lieu enregistré ». Le verbe ne change pas en route.
- Les erreurs ne s'excusent pas et ne sont jamais vagues. Elles disent ce qui a échoué et ce que l'utilisateur peut faire.
- Les écrans vides invitent à agir.
- Les unités sont toujours affichées, en `--encre-faible`, à un pas en dessous de la valeur.
- Les noms de modèles `AROME`, `AROME France`, `ICON-D2`, `ARPEGE`, `ICON-EU`, `ECMWF IFS`, `GFS` sont conservés tels quels. Ne pas les traduire ni les vulgariser, l'audience les cherche.
- Une justification dit le vrai critère, chiffré. Un critère défavorable au modèle retenu est dit aussi, à part (« Moins juste ici sur le vent… »).
- Espaces insécables entre un nombre et son unité, et avant les deux-points.

## 8. Mouvement

Peu, et seulement au service de la compréhension.

- Transition de la bande d'incertitude quand on change de variable : 180 ms, `ease-out`.
- Changement d'onglet : fondu de 150 ms.
- Bascule du mode comparaison : ouverture du panneau, 220 ms.
- Aucune animation d'entrée en cascade, aucun effet de survol décoratif, aucun compteur qui s'incrémente.
- `@media (prefers-reduced-motion: reduce)` supprime toute transition, sans exception.

## 9. Plancher de qualité

- Responsive jusqu'à 320 px de large.
- Focus clavier visible sur tout élément interactif, contour de 2 px en `--encre`, jamais `outline: none` sans remplacement.
- Les graphiques Chart.js exposent une table de données équivalente, masquée visuellement, accessible aux lecteurs d'écran.
- Cibles tactiles de 44 px minimum.
- Impression : la grille de fond et les commandes disparaissent, les graphiques et valeurs restent.

# DESIGN.md

## 1. Direction

**Sujet** : un instrument de mesure, pas une application météo grand public. L'audience sait déjà ce qu'est un modèle de prévision, ou vient l'apprendre. Le travail de la page est de rendre lisible ce qui est mesuré, ce qui est estimé et ce qui est incertain.

**Le vocabulaire visuel vient du monde du sujet** : papier millimétré des barographes, tracés d'émagramme, légendes d'axes, chiffres alignés en colonnes. Pas de grandes icônes soleil-nuage stylisées, pas de dégradés de ciel, pas de photo de fond. L'interface a l'aspect d'un relevé, parce que c'est ce qu'elle est.

**Élément signature** : la bande d'incertitude en hachures diagonales. Là où toutes les applications météo tracent une courbe unique et confiante, celle-ci trace la courbe du modèle actif sur une bande hachurée représentant l'écart entre modèles. Quand les modèles s'accordent, la bande disparaît presque. Quand ils divergent, elle s'ouvre visiblement. L'incertitude devient une forme, pas un badge.

**Risque assumé** : la confiance n'est pas encodée par la couleur. La couleur appartient exclusivement au modèle. La confiance est encodée par la **texture du trait**, comme sur un relevé tracé à la main : trait plein pour élevée, tireté pour moyenne, pointillé pour faible. C'est plus exigeant à lire au premier coup d'oeil qu'un feu tricolore, mais cela libère la couleur pour la seule information qui en a besoin, et cela reste lisible en niveaux de gris et pour un daltonien. Une légende permanente en bas du graphique rend l'apprentissage immédiat.

## 2. Palette

Les couleurs de tracé sont la palette Okabe-Ito, choisie parce qu'elle est distinguable pour les trois formes principales de daltonisme. Ce n'est pas une préférence esthétique, c'est une contrainte de lisibilité assumée dans un produit qui superpose quatre courbes.

```css
:root {
  /* Surfaces */
  --papier:        #E9EDEA;  /* fond, gris-vert tres pale, papier d'enregistreur */
  --papier-haut:   #F4F6F3;  /* cartes, panneaux */
  --grille:        #C3CCC8;  /* lignes de grille, filets */
  --grille-faible: #D8DFDB;  /* grille secondaire */

  /* Encre */
  --encre:         #16232B;  /* texte principal, axes */
  --encre-faible:  #5A6B72;  /* labels, unites, texte secondaire */

  /* Traces de modele (Okabe-Ito, assombri pour tenir sur fond clair) */
  --arome:         #005B8F;  /* bleu */
  --arpege:        #B35300;  /* vermillon fonce */
  --icon-eu:       #007A5A;  /* vert bleute */
  --gfs:           #9B4E7E;  /* pourpre */

  /* Signaux */
  --alerte:        #A32020;  /* vigilance, seuil franchi */
  --observe:       #16232B;  /* provenance mesuree: encre pleine */
  --estime:        #5A6B72;  /* provenance estimee: encre affaiblie */
}
```

Mode sombre, activé par `prefers-color-scheme` et surchargeable dans les réglages :

```css
@media (prefers-color-scheme: dark) {
  :root {
    --papier:        #10181C;
    --papier-haut:   #18232A;
    --grille:        #2C3A42;
    --grille-faible: #212C33;
    --encre:         #DCE5E2;
    --encre-faible:  #8FA1A8;
    --arome:         #4BA3DC;
    --arpege:        #E8863A;
    --icon-eu:       #34B48C;
    --gfs:           #C784AC;
    --alerte:        #E05252;
    --observe:       #DCE5E2;
    --estime:        #8FA1A8;
  }
}
```

Contraste : toute paire texte sur fond doit atteindre AA (4.5:1 pour le corps, 3:1 pour le texte large). À vérifier en CI, voir `TESTING.md`.

## 3. Typographie

Trois rôles, trois coupes de la même famille. IBM Plex est retenue parce qu'elle vient du dessin technique et documentaire, dispose d'une coupe condensée et d'une coupe monospace cohérentes, et possède de vrais chiffres tabulaires.

```css
:root {
  --font-display: 'IBM Plex Sans Condensed', system-ui, sans-serif;
  --font-corps:   'IBM Plex Sans', system-ui, sans-serif;
  --font-donnee:  'IBM Plex Mono', ui-monospace, monospace;
}
```

**Règle centrale** : toute valeur mesurée ou prévue est composée en `--font-donnee`, avec `font-variant-numeric: tabular-nums`, à un corps supérieur à son étiquette. Les chiffres ne bougent pas quand la valeur change. L'interface se lit comme un afficheur, pas comme un article.

Les titres de section et les étiquettes d'axe sont en `--font-display`, en capitales, avec un interlettrage large, comme les mentions portées sur un axe de graphique.

```css
:root {
  --pas-xs:  0.6875rem;  /* 11px, etiquettes d'axe, unites */
  --pas-s:   0.8125rem;  /* 13px, corps secondaire */
  --pas-m:   1rem;       /* 16px, corps */
  --pas-l:   1.375rem;   /* 22px, valeurs secondaires */
  --pas-xl:  2.5rem;     /* 40px, valeur principale */
  --pas-xxl: 4rem;       /* 64px, temperature du moment */

  --eyebrow: {
    font-family: var(--font-display);
    font-size: var(--pas-xs);
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--encre-faible);
  }
}
```

Chargement : les trois coupes en `woff2`, auto-hébergées dans `public/fonts/`, `font-display: swap`, sous-ensemble latin étendu. Pas d'appel à un CDN de polices, cela casserait le fonctionnement hors ligne.

## 4. Grille et espacement

```css
:root {
  --u: 4px;
  --esp-1: calc(var(--u) * 1);   /*  4px */
  --esp-2: calc(var(--u) * 2);   /*  8px */
  --esp-3: calc(var(--u) * 3);   /* 12px */
  --esp-4: calc(var(--u) * 4);   /* 16px */
  --esp-6: calc(var(--u) * 6);   /* 24px */
  --esp-8: calc(var(--u) * 8);   /* 32px */
  --esp-12: calc(var(--u) * 12); /* 48px */

  --rayon: 2px;          /* quasi nul: c'est un releve, pas une carte de visite */
  --filet: 1px solid var(--grille);
  --largeur-max: 1120px;
}
```

Points de rupture : `640px` et `1024px`. Conception mobile d'abord.

Le fond de page porte une grille millimétrée discrète, en `background-image` de gradients répétés, opacité très basse, désactivée sous `prefers-reduced-motion` inutile ici mais désactivée à l'impression. C'est le seul ornement autorisé de la page.

## 5. Encodages visuels, table de référence

Cette table est normative. Aucun composant ne doit inventer un autre encodage.

| Information | Encodage | Jamais |
|---|---|---|
| Modèle | Couleur du tracé | Autre chose que la couleur |
| Confiance | Texture du trait : plein, tireté 6-3, pointillé 2-3 | Couleur, emoji, feu tricolore |
| Dispersion inter-modèles | Bande hachurée diagonale à 45° | Aplat translucide |
| Provenance observée | Encre pleine, pastille circulaire pleine | Vert |
| Provenance estimée | Encre affaiblie, pastille circulaire creuse | Rouge, orange |
| Provenance prévue | Encre normale, sans pastille | Pastille |
| Transition de modèle | Filet vertical tireté + étiquette verticale | Aucun marqueur |
| Vigilance | Bandeau pleine largeur, couleur `--alerte` | Icône seule |
| Donnée périmée | Bandeau d'horodatage en haut du contenu | Griser le contenu |
| Condition météo (code WMO) | Étiquette texte courte en `--font-corps`, `--encre-faible` (ex. « Pluie légère », « Orage ») | Icône ou pictogramme, couleur dédiée |

Condition météo : le code WMO (`weatherCode`) est traduit en étiquette texte française (table dans `src/ui/weatherCodePresentation.ts`), jamais en icône, pour rester cohérent avec le principe section 1 (pas de grandes icônes soleil-nuage stylisées). Affichée à côté de la température dans le bloc « maintenant », par jour dans la vue 7 jours, et par heure dans l'infobulle et la table de données équivalente de la timeline 48 h. Un code absent ou inconnu n'affiche aucune étiquette plutôt qu'un texte par défaut trompeur.

## 6. Maquettes

### 6.1 Accueil, mobile (largeur 380)

```
┌──────────────────────────────────┐
│ ≡   VAL DE VIRIEU        ⌕   ⚙   │
│     Isere · 468 m                │
├──────────────────────────────────┤
│                                  │
│  MAINTENANT                      │
│                                  │
│   14,2 °C          ┌───────────┐ │
│   ─────────        │  AROME    │ │
│   ressenti 13,1    │ confiance │ │
│                    │  elevee   │ │
│   ↖ 12 km/h        └───────────┘ │
│   raf. 24 km/h                   │
│   1014 hPa  ↘                    │
│                                  │
├──────────────────────────────────┤
│ 48 HEURES                        │
│                                  │
│ 18°┤                     ╱▒▒╲    │
│    │        ╱‾‾╲    ╱▒▒▒╱    ╲   │
│ 14°┤   ────╱     ╲──╱ ┊         │
│    │                  ┊          │
│ 10°┤                  ┊          │
│    └──┬────┬────┬────┬┊───┬────┬ │
│      06h  12h  18h  00h┊ 06h  12h│
│                        ┊         │
│                    AROME│ARPEGE  │
│                                  │
│ ── plein: confiance elevee       │
│ ▒▒ hachure: ecart entre modeles  │
├──────────────────────────────────┤
│ 7 JOURS                          │
│                                  │
│ Lun 17  ▁▁  22° / 12°   0,0 mm   │
│ Mar 18  ▃▃  19° / 11°   2,4 mm   │
│ Mer 19  ▅▅  17° / 10°   6,1 mm ┊ │
│ Jeu 20  ▂▂  20° /  9°   0,8 mm ┊ │
│ Ven 21  ▁▁  23° / 11°   0,0 mm ┊ │
│                                ┊ │
│              confiance faible ──┘ │
├──────────────────────────────────┤
│  ◉ Val de Virieu   ○ Golfe du M. │
└──────────────────────────────────┘
```

Le bloc « maintenant » ne cache pas quel modèle parle. Le nom du modèle est aussi visible que la température, c'est la thèse du produit.

### 6.2 Détail horaire, desktop (largeur 1120)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  VAL DE VIRIEU  ·  Isere  ·  468 m  ·  plateau        [ ⌕ lieu ]  [ ⚙ ]   │
├────────────────────────────────────────────────────────────────────────────┤
│  ⚠  VIGILANCE JAUNE ORAGES  ·  Isere  ·  jusqu'a mercredi 22h              │
├──────────────────────────────────────────┬─────────────────────────────────┤
│                                          │                                 │
│  TEMPERATURE                             │  MODELE ACTIF                   │
│                                          │  ─────────────                  │
│ 22°┤                                     │  AROME 1,3 km                   │
│    │              ╱▒▒▒▒╲                 │  Meteo-France                   │
│ 18°┤      ╱‾‾‾╲  ╱▒▒▒▒▒▒╲ ╱┈┈┈           │  echeance 36 h                  │
│    │  ───╱     ╲╱        ╳   ┈┈┈╲        │                                 │
│ 14°┤ ╱                  ╱ ╲      ┈┈      │  Choisi parce que l'echeance    │
│    │                   ┊                 │  demandee est a 12 h. Au dela   │
│ 10°┤                   ┊                 │  de 36 h, ARPEGE prend le       │
│    └──┬──────┬──────┬──┊───┬──────┬───   │  relais.                        │
│      06h    12h    18h ┊  00h    06h     │                                 │
│                        ┊                 │  CONFIANCE                      │
│                  AROME │ ARPEGE          │  ─────────                      │
│                                          │  Elevee jusqu'a mercredi 06h    │
│  ── plein   confiance elevee             │  Moyenne ensuite                │
│  ┈┈ pointille  confiance faible          │                                 │
│  ▒▒ hachure  ecart entre modeles         │  Ecart max entre modeles        │
│                                          │  temperature   1,2 °C           │
├──────────────────────────────────────────┤  vent          6 km/h           │
│                                          │  precipitations faible          │
│  PRECIPITATIONS                          │                                 │
│                                          │  ┌───────────────────────────┐  │
│  6 ┤              ▓                      │  │ COMPARER LES MODELES      │  │
│  4 ┤            ▓ ▓ ░                    │  └───────────────────────────┘  │
│  2 ┤        ░   ▓ ▓ ░ ░                  │                                 │
│  0 ┼────────░───▓─▓─░─░───────           │  RELEVE OBSERVE                 │
│      06h   12h   18h   00h               │  ────────────────               │
│                                          │  ● station Bourgoin, 11 km      │
│  ▓ observe   ░ prevu                     │  24 h      1,8 mm               │
│                                          │  7 jours   14,2 mm              │
└──────────────────────────────────────────┴─────────────────────────────────┘
```

### 6.3 Mode comparaison

```
┌────────────────────────────────────────────────────────────────────────────┐
│  COMPARER LES MODELES                                          [ fermer ]  │
├────────────────────────────────────────────────────────────────────────────┤
│  Variable  [ temperature ▾ ]     Echeance  [ 72 h ▾ ]                      │
│                                                                            │
│ 22°┤                          ╱‾‾‾╲                                        │
│    │                    ╱━━━━╱     ╲━━━                                    │
│ 18°┤        ╱‾‾‾╲ ╱‾‾‾‾╱  ╱┅┅┅┅╲                                          │
│    │  ━━━━━╱     ╳      ╳┅       ┅┅┅┅                                     │
│ 14°┤ ╱           ┅╲    ╱  ╲···········                                    │
│    │              ┅╲··╱    ╲                                              │
│ 10°┤                ··       ·······                                      │
│    └──┬──────┬──────┬──────┬──────┬──────┬──────                          │
│      06h    18h    06h    18h    06h    18h                               │
│                                                                            │
│  ━━ AROME     jusqu'a 36 h                                                 │
│  ╱╲ ARPEGE    jusqu'a 96 h                                                 │
│  ┅┅ ICON-EU   jusqu'a 168 h                                                │
│  ·· GFS       jusqu'a 168 h                                                │
│                                                                            │
│  Ecart maximal 4,8 °C mercredi 15h. Les modeles ne s'accordent pas sur     │
│  le passage de la perturbation.                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

En mode comparaison, la texture du trait sert à identifier le modèle en complément de la couleur, puisque la confiance n'a plus de sens quand on regarde chaque modèle séparément. Le changement de convention est explicite dans la légende.

### 6.4 Fiabilité locale

```
┌──────────────────────────────────┐
│  FIABILITE A VAL DE VIRIEU       │
│  90 derniers jours               │
├──────────────────────────────────┤
│  TEMPERATURE, erreur a 24 h      │
│                                  │
│  AROME    0,9 °C   ████░░░░  61  │
│  ARPEGE   1,4 °C   ██████░░  61  │
│  ICON-EU  1,7 °C   ███████░  58  │
│  GFS      2,2 °C   ████████  58  │
│                                  │
│  PRECIPITATIONS, erreur a 24 h   │
│                                  │
│  AROME    1,2 mm   █████░░░  61  │
│  ARPEGE   1,8 mm   ███████░  61  │
│  ICON-EU     ---   collecte   6  │
│  GFS         ---   collecte   6  │
│                                  │
│  Mesure locale, calculee sur cet │
│  appareil. Aucune donnee ne quit-│
│  te votre telephone.             │
└──────────────────────────────────┘
```

### 6.5 États non nominaux

```
HORS LIGNE                          ERREUR
┌────────────────────────┐          ┌────────────────────────┐
│ ⊘ Hors ligne           │          │ Prevision indisponible │
│ Releve du 17/08 a 14h  │          │                        │
├────────────────────────┤          │ Le service de prevision│
│                        │          │ ne repond pas.         │
│  [ contenu normal,     │          │                        │
│    non grise ]         │          │ [ Reessayer ]          │
│                        │          │                        │
└────────────────────────┘          └────────────────────────┘

AUCUN FAVORI                        FIABILITE EN COLLECTE
┌────────────────────────┐          ┌────────────────────────┐
│ Aucun lieu enregistre. │          │ Encore 4 releves avant │
│                        │          │ le premier score.      │
│ [ Chercher une commune]│          │ Revenez dans 4 jours.  │
│ [ Utiliser ma position]│          │                        │
└────────────────────────┘          └────────────────────────┘
```

Le contenu périmé n'est jamais grisé. Griser suggère « désactivé ». L'horodatage suffit à dire ce qu'il en est.

## 7. Rédaction de l'interface

- Nommer les choses par ce que l'utilisateur reconnaît. « Relevé du 17/08 à 14h », pas « cache hit, TTL expired ».
- Le bouton dit ce qui se passe. « Enregistrer ce lieu » puis notification « Lieu enregistré ». Le verbe ne change pas en route.
- Les erreurs ne s'excusent pas et ne sont jamais vagues. Elles disent ce qui a échoué et ce que l'utilisateur peut faire.
- Les écrans vides invitent à agir.
- Les unités sont toujours affichées, en `--encre-faible`, à un pas en dessous de la valeur.
- Les termes techniques `AROME`, `ARPEGE`, `ICON-EU`, `GFS` sont conservés tels quels. Ne pas les traduire ni les vulgariser, l'audience les cherche.

## 8. Mouvement

Peu, et seulement au service de la compréhension.

- Transition de la bande d'incertitude quand on change de variable : 180 ms, `ease-out`.
- Bascule du mode comparaison : ouverture du panneau, 220 ms.
- Aucune animation d'entrée en cascade, aucun effet de survol décoratif, aucun compteur qui s'incrémente.
- `@media (prefers-reduced-motion: reduce)` supprime toute transition, sans exception.

## 9. Plancher de qualité

- Responsive jusqu'à 320 px de large.
- Focus clavier visible sur tout élément interactif, contour de 2 px en `--encre`, jamais `outline: none` sans remplacement.
- Les graphiques Chart.js exposent une table de données équivalente, masquée visuellement, accessible aux lecteurs d'écran.
- Cibles tactiles de 44 px minimum.
- Impression : la grille de fond et les commandes disparaissent, les graphiques et valeurs restent.

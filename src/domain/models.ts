import type { ModelId, TerrainKind } from './types';

/**
 * Catalogue declaratif des modeles de prevision (ROADMAP.md R1). Toute
 * connaissance "par modele" (portee, maille, domaine, forces, faiblesses)
 * vit ici et nulle part ailleurs : la cascade, la selection automatique et
 * les textes d'interface lisent ce registre plutot que des `switch` epars.
 *
 * Portees et mailles verifiees contre la documentation Open-Meteo
 * (open-meteo.com/en/docs/meteofrance-api, dwd-api, ecmwf-api, gfs-api)
 * au 2026-09-28. Les portees sont volontairement arrondies vers le bas :
 * au-dela, Open-Meteo renvoie des null de fin de serie.
 */

export type ModelDomain = 'france' | 'central_europe' | 'europe' | 'global';

export type ModelProducer = 'Météo-France' | 'DWD' | 'ECMWF' | 'NOAA';

export interface ModelSpec {
  readonly id: ModelId;
  /** Nom affiche, conserve tel quel (DESIGN.md section 7). */
  readonly label: string;
  readonly producer: ModelProducer;
  /** Maille native approximative, km. */
  readonly resolutionKm: number;
  /** Portee maximale exploitable, heures depuis maintenant. */
  readonly maxLeadHours: number;
  /** Frequence des nouvelles executions, heures. */
  readonly runEveryHours: number;
  readonly domain: ModelDomain;
  /** Rang de finesse : plus petit = plus fin. Sert au departage. */
  readonly finenessRank: number;
  /** Variables horaires que le modele ne fournit pas nativement chez Open-Meteo. */
  readonly missingHourly: readonly string[];
  /** Points forts, en francais, pour la fiche modele. */
  readonly strengths: readonly string[];
  /** Points faibles, en francais, pour la fiche modele. */
  readonly weaknesses: readonly string[];
}

export const MODEL_SPECS: Readonly<Record<ModelId, ModelSpec>> = {
  arome: {
    id: 'arome',
    label: 'AROME',
    producer: 'Météo-France',
    resolutionKm: 1.3,
    maxLeadHours: 48,
    runEveryHours: 1,
    domain: 'france',
    finenessRank: 0,
    missingHourly: [
      'cloud_cover',
      'weather_code',
      'pressure_msl',
      'snowfall',
      'visibility',
      'freezing_level_height',
    ],
    strengths: [
      'Maille la plus fine disponible (1,3 km) : relief, vallées et littoral bien résolus',
      'Résout explicitement les orages et averses convectives',
      'Nouvelle exécution toutes les heures',
    ],
    weaknesses: [
      'Portée courte, 48 h au plus',
      'Jeu de variables réduit : nébulosité, pression et code de temps sont complétés par un autre modèle',
      'Peut surestimer localement les cumuls orageux',
    ],
  },
  arome_france: {
    id: 'arome_france',
    label: 'AROME France',
    producer: 'Météo-France',
    resolutionKm: 2.5,
    maxLeadHours: 51,
    runEveryHours: 3,
    domain: 'france',
    finenessRank: 1,
    missingHourly: ['visibility', 'freezing_level_height'],
    strengths: [
      'Maille fine (2,5 km) avec nébulosité, pression et code de temps',
      'Complète AROME 1,3 km sur les variables que celui-ci ne fournit pas',
      'Bonne représentation des orages et du vent local',
    ],
    weaknesses: [
      'Portée courte, environ 2 jours',
      'Moins fin que la version 1,3 km en relief marqué',
    ],
  },
  icon_d2: {
    id: 'icon_d2',
    label: 'ICON-D2',
    producer: 'DWD',
    resolutionKm: 2.2,
    maxLeadHours: 48,
    runEveryHours: 3,
    domain: 'central_europe',
    finenessRank: 2,
    missingHourly: [],
    strengths: [
      'Maille fine (2,2 km), convection résolue',
      'Deuxième avis indépendant de Météo-France à courte échéance',
      'Excellent sur le nord-est et les Alpes',
    ],
    weaknesses: [
      'Domaine limité à l’Europe centrale : ouest et sud de la France hors couverture',
      'Portée 48 h',
    ],
  },
  arpege: {
    id: 'arpege',
    label: 'ARPEGE',
    producer: 'Météo-France',
    resolutionKm: 10,
    maxLeadHours: 102,
    runEveryHours: 6,
    domain: 'europe',
    finenessRank: 3,
    missingHourly: ['visibility', 'freezing_level_height'],
    strengths: [
      'Modèle de référence de Météo-France sur 4 jours',
      'Maille resserrée sur l’Europe (10 km)',
      'Bonne continuité avec AROME, même physique',
    ],
    weaknesses: [
      'Ne résout pas les orages isolés (convection paramétrée)',
      'Relief lissé : températures moins justes en montagne',
    ],
  },
  icon_eu: {
    id: 'icon_eu',
    label: 'ICON-EU',
    producer: 'DWD',
    resolutionKm: 7,
    maxLeadHours: 120,
    runEveryHours: 3,
    domain: 'europe',
    finenessRank: 4,
    missingHourly: [],
    strengths: [
      'Maille de 7 km sur toute l’Europe, jusqu’à 5 jours',
      'Exécution toutes les 3 h',
      'Avis indépendant de Météo-France',
    ],
    weaknesses: ['Tendance à surestimer les faibles pluies', 'Portée limitée à 5 jours'],
  },
  ecmwf: {
    id: 'ecmwf',
    label: 'ECMWF IFS',
    producer: 'ECMWF',
    resolutionKm: 25,
    maxLeadHours: 360,
    runEveryHours: 6,
    domain: 'global',
    finenessRank: 5,
    missingHourly: ['visibility', 'freezing_level_height'],
    strengths: [
      'Référence mondiale en moyenne échéance (3 à 10 jours)',
      'Meilleure prévision des grandes situations (dépressions, anticyclones)',
      'Portée 15 jours',
    ],
    weaknesses: [
      'Données ouvertes à 0,25° (25 km) : détails locaux lissés',
      'Pas de 3 h au-delà de 90 h, interpolé à l’heure',
      'Même famille que la réanalyse ERA5 : avantagé quand ERA5 sert de référence',
    ],
  },
  gfs: {
    id: 'gfs',
    label: 'GFS',
    producer: 'NOAA',
    resolutionKm: 25,
    maxLeadHours: 384,
    runEveryHours: 6,
    domain: 'global',
    finenessRank: 6,
    missingHourly: [],
    strengths: ['Portée la plus longue (16 jours)', 'Jeu de variables très complet'],
    weaknesses: [
      'Maille large (25 km) sur la France',
      'Moins fiable qu’ECMWF en moyenne échéance',
      'Relief et littoral grossièrement représentés',
    ],
  },
};

/** Ordre canonique d'affichage et de departage : du plus fin au plus large. */
export const MODEL_ORDER: readonly ModelId[] = (Object.keys(MODEL_SPECS) as ModelId[]).sort(
  (a, b) => MODEL_SPECS[a].finenessRank - MODEL_SPECS[b].finenessRank,
);

/**
 * Emprise approximative d'ICON-D2 (lat 43.2-58.1, lon -3.9-20.3, grille
 * tournee). Test volontairement prudent : on retire une marge d'un demi
 * degre pour ne jamais annoncer une couverture en bord de domaine ou le
 * modele renvoie des null.
 */
const ICON_D2_BOUNDS = { minLat: 43.7, maxLat: 57.6, minLon: -3.4, maxLon: 19.8 } as const;

/** Le modele couvre-t-il ce point geographique ? */
export function coversLocation(model: ModelId, latitude: number, longitude: number): boolean {
  const spec = MODEL_SPECS[model];
  if (spec.domain === 'central_europe') {
    return (
      latitude >= ICON_D2_BOUNDS.minLat &&
      latitude <= ICON_D2_BOUNDS.maxLat &&
      longitude >= ICON_D2_BOUNDS.minLon &&
      longitude <= ICON_D2_BOUNDS.maxLon
    );
  }
  // Les domaines 'france', 'europe' et 'global' couvrent toute la metropole,
  // Corse comprise : l'application refuse deja les lieux hors metropole.
  return true;
}

/**
 * Adequation a priori maille / terrain, sans unite, dans [0, 1]. Une maille
 * fine compte davantage la ou le relief ou le trait de cote creent des
 * effets locaux que 25 km lissent : montagne et littoral.
 */
export function terrainFit(model: ModelId, terrain: TerrainKind): number {
  const km = MODEL_SPECS[model].resolutionKm;
  // Sensibilite a la maille par type de terrain : exposant de penalite.
  const sensitivity: Readonly<Record<TerrainKind, number>> = {
    mountain: 1,
    coastal: 0.8,
    plateau: 0.5,
    plain: 0.3,
  };
  // 1 km -> 1 ; 25 km -> 25^-s. Borne dans [0, 1].
  return Math.min(1, Math.max(0, km ** -sensitivity[terrain]));
}

/** Liste de modeles tries selon MODEL_ORDER. */
export function sortModels(models: readonly ModelId[]): readonly ModelId[] {
  return [...models].sort((a, b) => MODEL_SPECS[a].finenessRank - MODEL_SPECS[b].finenessRank);
}

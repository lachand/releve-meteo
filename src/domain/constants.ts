import type { TerrainKind, WeatherVariable } from './types';

export const TERRAIN_THRESHOLDS = {
  mountainElevationM: 900,
  plateauElevationM: 300,
  coastalDistanceKm: 10,
} as const;

/** Seuils de dispersion inter-modeles. Bornes basses inclusives. */
export const CONFIDENCE_THRESHOLDS = {
  temperature: { high: 1.5, medium: 3.5 }, // ecart max-min, °C
  wind: { high: 8, medium: 18 }, // ecart max-min, km/h
  precipitation: { high: 0.3, medium: 0.7 }, // coefficient de variation
} as const;

/** Penalites terrain: degrade d'un cran le niveau de la variable visee. */
export const TERRAIN_PENALTIES: Readonly<Record<TerrainKind, readonly WeatherVariable[]>> = {
  coastal: ['wind'],
  mountain: ['precipitation', 'temperature'],
  plateau: [],
  plain: [],
} as const;

export const RELIABILITY = {
  retentionDays: 90,
  minSamples: 10,
} as const;

export const CACHE_TTL_MS = {
  forecast: 60 * 60 * 1000,
  geocoding: 30 * 24 * 60 * 60 * 1000,
  vigilance: 15 * 60 * 1000,
  radar: 15 * 60 * 1000,
  /** L'ensemble ECMWF est reexecute toutes les 6 h. */
  ensemble: 3 * 60 * 60 * 1000,
  /** La fenetre de verification glisse d'un jour par jour. */
  verification: 12 * 60 * 60 * 1000,
  airQuality: 3 * 60 * 60 * 1000,
  /** Pas de 15 min : le nowcast vieillit vite. */
  nowcast: 10 * 60 * 1000,
} as const;

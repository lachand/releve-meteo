import type { LocalIsoHour, ModelId } from './types';

/*
 * Grille de la carte de prevision : des points reguliers autour du lieu,
 * interroges en une seule requete. Chaque case porte la valeur du modele
 * en son centre, jamais une interpolation : la carte montre ce que le
 * modele calcule, a la resolution de la grille.
 */

export const FORECAST_GRID = {
  /** Cases par cote, impair : le lieu est au centre. */
  size: 9,
  /** Pas entre deux points, km : 100 km de cote pour 9 cases. */
  stepKm: 12.5,
} as const;

const KM_PER_DEGREE_LATITUDE = 111.32;

export interface GridPoint {
  /** Rang 0 au nord. */
  readonly row: number;
  /** Colonne 0 a l'ouest. */
  readonly col: number;
  readonly latitude: number;
  readonly longitude: number;
}

export interface CellBounds {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

/** Series de la grille : [index de temps][index de point], null si absente. */
export type GridSeries = readonly (readonly (number | null)[])[];

export interface ForecastGrid {
  readonly model: ModelId;
  /** Toute la grille est prevue : aucune case n'est une mesure. */
  readonly provenance: 'forecast';
  readonly points: readonly GridPoint[];
  readonly stepKm: number;
  readonly times: readonly LocalIsoHour[];
  /** °C. */
  readonly temperature: GridSeries;
  /** mm sur l'heure ecoulee. */
  readonly precipitation: GridSeries;
  /** km/h. */
  readonly windSpeed: GridSeries;
  /** Degres, direction d'ou vient le vent. */
  readonly windDirection: GridSeries;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function degreesPerKm(latitude: number): { readonly lat: number; readonly lon: number } {
  return {
    lat: 1 / KM_PER_DEGREE_LATITUDE,
    lon: 1 / (KM_PER_DEGREE_LATITUDE * Math.cos((latitude * Math.PI) / 180)),
  };
}

/** Points de la grille, ligne par ligne du nord au sud, d'ouest en est. */
export function gridPoints(
  center: { readonly latitude: number; readonly longitude: number },
  size: number = FORECAST_GRID.size,
  stepKm: number = FORECAST_GRID.stepKm,
): readonly GridPoint[] {
  if (size < 1 || size % 2 === 0) {
    throw new RangeError(`taille de grille impaire attendue, recu ${size}`);
  }
  const half = (size - 1) / 2;
  const scale = degreesPerKm(center.latitude);
  const points: GridPoint[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      points.push({
        row,
        col,
        latitude: round4(center.latitude + (half - row) * stepKm * scale.lat),
        longitude: round4(center.longitude + (col - half) * stepKm * scale.lon),
      });
    }
  }
  return points;
}

/** Case d'un point : un demi-pas de part et d'autre. */
export function cellBounds(point: GridPoint, stepKm: number): CellBounds {
  const scale = degreesPerKm(point.latitude);
  const halfLat = (stepKm / 2) * scale.lat;
  const halfLon = (stepKm / 2) * scale.lon;
  return {
    south: point.latitude - halfLat,
    west: point.longitude - halfLon,
    north: point.latitude + halfLat,
    east: point.longitude + halfLon,
  };
}

/**
 * Dernier instant ou au moins une case a une temperature : la portee
 * effective du modele depuis son dernier calcul. -1 si aucune.
 */
export function lastCoveredIndex(grid: ForecastGrid): number {
  for (let index = grid.temperature.length - 1; index >= 0; index -= 1) {
    if (grid.temperature[index]?.some((value) => value !== null) === true) {
      return index;
    }
  }
  return -1;
}

/** Minimum et maximum d'une serie de grille, null ignores ; null si vide. */
export function valueRange(
  series: GridSeries,
): { readonly min: number; readonly max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const row of series) {
    for (const value of row) {
      if (value !== null) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
  }
  return min === Infinity ? null : { min, max };
}

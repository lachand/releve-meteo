import { thunderRiskOf } from './phenomena';
import type { HourlyRisk } from './phenomena';
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
  /** J/kg : energie d'instabilite disponible, base de la carte d'orage. */
  readonly cape: GridSeries;
  /** Code meteo WMO du modele (95, 96, 99 : orage), null si absent. */
  readonly weatherCode: GridSeries;
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

/**
 * Orage prevu sur chaque case a un instant : le meme critere que les episodes
 * d'orage du lieu (code orage du modele, ou CAPE elevee avec de la pluie).
 * `null` : le modele ne fournit ni CAPE ni code meteo pour la case, donc rien
 * n'est dit ; `{ risk: null }` : donnees presentes, pas d'orage prevu.
 */
export function thunderCells(
  grid: ForecastGrid,
  index: number,
): readonly ({ readonly risk: HourlyRisk | null; readonly cape: number | null } | null)[] {
  const capes = grid.cape[index] ?? [];
  const precipitation = grid.precipitation[index] ?? [];
  const codes = grid.weatherCode[index] ?? [];
  return grid.points.map((_, i) => {
    const cape = capes[i] ?? null;
    const weatherCode = codes[i] ?? null;
    if (cape === null && weatherCode === null) {
      return null;
    }
    return {
      cape,
      risk: thunderRiskOf({ cape, precipitation: precipitation[i] ?? null, weatherCode }),
    };
  });
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

/**
 * Modeles de la carte du desaccord : un modele fin de France, un global
 * europeen, la reference de moyenne echeance et un modele americain. Quatre
 * grilles de 81 points, donc 324 appels du quota libre : la carte ne se charge
 * qu'a la demande.
 */
export const SPREAD_GRID_MODELS: readonly ModelId[] = ['arome_france', 'arpege', 'ecmwf', 'gfs'];

export interface SpreadGrid {
  /** Modeles dont les grilles ont servi, dans l'ordre. */
  readonly models: readonly ModelId[];
  /**
   * Grille dont `temperature` et `precipitation` sont des ecarts (plus haut
   * moins plus bas, en °C et en mm) ; vent a null. `model` est le premier.
   */
  readonly grid: ForecastGrid;
}

function spreadSeries(
  grids: readonly ForecastGrid[],
  pick: (grid: ForecastGrid) => GridSeries,
  times: number,
  points: number,
): GridSeries {
  return Array.from({ length: times }, (_, t) =>
    Array.from({ length: points }, (_, p): number | null => {
      const values = grids.flatMap((grid) => {
        const value = pick(grid)[t]?.[p] ?? null;
        return value === null ? [] : [value];
      });
      // Une case sans deux modeles n'a pas d'ecart : null, pas zero.
      return values.length < 2 ? null : Math.max(...values) - Math.min(...values);
    }),
  );
}

/**
 * Ecart entre les modeles sur chaque case et chaque heure. Les grilles doivent
 * porter les memes points et les memes instants ; sinon, ou sous deux grilles,
 * rien n'est compare.
 */
export function spreadGrid(grids: readonly ForecastGrid[]): SpreadGrid | null {
  const [first] = grids;
  if (first === undefined || grids.length < 2) {
    return null;
  }
  const aligned = grids.every(
    (grid) =>
      grid.points.length === first.points.length &&
      grid.times.length === first.times.length &&
      grid.times.every((time, index) => time === first.times[index]),
  );
  if (!aligned) {
    return null;
  }
  const times = first.times.length;
  const points = first.points.length;
  const empty: GridSeries = Array.from({ length: times }, () =>
    Array.from({ length: points }, () => null),
  );
  return {
    models: grids.map((grid) => grid.model),
    grid: {
      ...first,
      temperature: spreadSeries(grids, (g) => g.temperature, times, points),
      precipitation: spreadSeries(grids, (g) => g.precipitation, times, points),
      windSpeed: empty,
      windDirection: empty,
      cape: empty,
      weatherCode: empty,
    },
  };
}

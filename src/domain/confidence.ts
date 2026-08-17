import { CONFIDENCE_THRESHOLDS, TERRAIN_PENALTIES } from './constants';
import type {
  ConfidenceLevel,
  ForecastBundle,
  HourlyPoint,
  ModelId,
  TerrainProfile,
  WeatherVariable,
} from './types';

export interface Dispersion {
  readonly variable: WeatherVariable;
  readonly spread: number; // °C, km/h, ou coefficient de variation
  readonly modelCount: number;
}

export interface ConfidenceVerdict {
  readonly level: ConfidenceLevel; // minimum des niveaux
  readonly byVariable: Readonly<Partial<Record<WeatherVariable, ConfidenceLevel>>>;
  readonly drivers: readonly WeatherVariable[]; // variables qui tirent vers le bas
  readonly modelCount: number;
}

const ALL_MODELS: readonly ModelId[] = ['arome', 'arpege', 'icon_eu', 'gfs'];
const VARIABLES: readonly WeatherVariable[] = ['temperature', 'wind', 'precipitation'];
const LEVEL_ORDER: Readonly<Record<ConfidenceLevel, number>> = {
  high: 3,
  medium: 2,
  low: 1,
  unavailable: 0,
};

function fieldValue(point: HourlyPoint, variable: WeatherVariable): number | null {
  switch (variable) {
    case 'temperature':
      return point.temperature.value;
    case 'wind':
      return point.windSpeed.value;
    case 'precipitation':
      return point.precipitation.value;
  }
}

function valuesAt(bundle: ForecastBundle, index: number, variable: WeatherVariable): number[] {
  const values: number[] = [];
  for (const model of ALL_MODELS) {
    const point = bundle.series[model]?.hourly[index];
    if (point === undefined) {
      continue;
    }
    const value = fieldValue(point, variable);
    if (value !== null) {
      values.push(value);
    }
  }
  return values;
}

/**
 * Coefficient de variation (ecart-type / moyenne). Si la moyenne est nulle,
 * tous les modeles annoncent la meme valeur nulle : accord parfait, spread
 * 0, jamais NaN.
 */
function coefficientOfVariation(values: readonly number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean === 0) {
    return 0;
  }
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** null si moins de 2 modeles ont une valeur non nulle a cet index. */
export function dispersionAt(
  bundle: ForecastBundle,
  index: number,
  variable: WeatherVariable,
): Dispersion | null {
  const values = valuesAt(bundle, index, variable);
  if (values.length < 2) {
    return null;
  }
  const spread =
    variable === 'precipitation'
      ? coefficientOfVariation(values)
      : Math.max(...values) - Math.min(...values);
  return { variable, spread, modelCount: values.length };
}

function downgrade(level: ConfidenceLevel): ConfidenceLevel {
  if (level === 'high') {
    return 'medium';
  }
  // Une penalite degrade d'un cran mais ne rend jamais une donnee
  // indisponible : low reste low.
  return 'low';
}

/** Applique les seuils puis la penalite terrain. */
export function gradeDispersion(dispersion: Dispersion, terrain: TerrainProfile): ConfidenceLevel {
  const thresholds = CONFIDENCE_THRESHOLDS[dispersion.variable];
  let level: ConfidenceLevel;
  if (dispersion.spread < thresholds.high) {
    level = 'high';
  } else if (dispersion.spread <= thresholds.medium) {
    level = 'medium';
  } else {
    level = 'low';
  }
  if (TERRAIN_PENALTIES[terrain.kind].includes(dispersion.variable)) {
    level = downgrade(level);
  }
  return level;
}

/**
 * Verdict global. level = minimum des niveaux par variable.
 * Si modelCount < 2 sur toutes les variables -> 'unavailable'.
 */
export function confidenceAt(
  bundle: ForecastBundle,
  index: number,
  terrain: TerrainProfile,
): ConfidenceVerdict {
  const byVariable: Partial<Record<WeatherVariable, ConfidenceLevel>> = {};
  let modelCount = 0;

  for (const variable of VARIABLES) {
    const dispersion = dispersionAt(bundle, index, variable);
    if (dispersion === null) {
      continue;
    }
    byVariable[variable] = gradeDispersion(dispersion, terrain);
    modelCount = Math.max(modelCount, dispersion.modelCount);
  }

  const levels = Object.values(byVariable);
  if (levels.length === 0) {
    return { level: 'unavailable', byVariable, drivers: [], modelCount: 0 };
  }

  const level = levels.reduce((min, current) =>
    LEVEL_ORDER[current] < LEVEL_ORDER[min] ? current : min,
  );
  const drivers = VARIABLES.filter((variable) => byVariable[variable] === level);

  return { level, byVariable, drivers, modelCount };
}

/** Fourchette min/max inter-modeles, pour la bande d'incertitude. */
export function spreadBand(
  bundle: ForecastBundle,
  variable: WeatherVariable,
): readonly { readonly min: number | null; readonly max: number | null }[] {
  return bundle.timeline.map((_, index) => {
    const values = valuesAt(bundle, index, variable);
    if (values.length === 0) {
      return { min: null, max: null };
    }
    return { min: Math.min(...values), max: Math.max(...values) };
  });
}

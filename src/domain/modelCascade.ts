import { MODEL_ORDER } from './models';
import type { ForecastBundle, HourlyPoint, Measure, ModelId } from './types';

/*
 * Cascade : decoupage de la timeline en segments contigus, un modele par
 * segment. Le choix du modele a chaque echeance est fait par
 * `modelSelection.ts` (score explicable, performance locale mesuree) ; ce
 * module ne fait plus que manipuler les segments. La cascade fixe par
 * echeance (AROME <= 36 h, ARPEGE <= 96 h...) des lots 1 a 6 est remplacee,
 * cf. ROADMAP.md phase A.
 */

export interface CascadeSegment {
  readonly model: ModelId;
  readonly startIndex: number; // inclusif, index dans timeline
  readonly endIndex: number; // inclusif
}

/**
 * Champs qu'un modele peut ne pas fournir alors qu'il couvre l'echeance
 * (AROME 1,3 km : ni nebulosite, ni pression, ni code de temps chez
 * Open-Meteo). La temperature n'en fait pas partie : c'est elle qui definit
 * la couverture d'un modele, un modele sans temperature n'est pas retenu.
 */
export const FILLABLE_FIELDS = [
  'precipitation',
  'windSpeed',
  'windGust',
  'windDirection',
  'pressure',
  'dewPoint',
  'cloudCover',
  'radiation',
  'humidity',
  'apparentTemperature',
  'precipitationProbability',
  'snowfall',
  'cape',
  'visibility',
  'freezingLevel',
  'weatherCode',
] as const;

export type FillableField = (typeof FILLABLE_FIELDS)[number];

/**
 * Point de la cascade : les valeurs du modele retenu, et pour chaque champ
 * que ce modele ne fournit pas a cet instant, la valeur du modele le plus
 * fin qui la fournit, avec son nom dans `filledFrom`. Rien n'est lisse ni
 * moyenne : chaque valeur vient d'un modele nomme (AGENTS.md, regle 7).
 */
export type BlendedPoint = HourlyPoint & {
  readonly model: ModelId;
  readonly filledFrom: Readonly<Partial<Record<FillableField, ModelId>>>;
};

/** Index de timeline ou le modele change. Utilise pour dessiner les marqueurs. */
export function transitionIndices(segments: readonly CascadeSegment[]): readonly number[] {
  return segments.slice(1).map((segment) => segment.startIndex);
}

/** Modele du segment qui contient l'index, ou null hors cascade. */
export function modelAt(segments: readonly CascadeSegment[], index: number): ModelId | null {
  const segment = segments.find((s) => index >= s.startIndex && index <= s.endIndex);
  return segment?.model ?? null;
}

function isMissing(point: HourlyPoint, field: FillableField): boolean {
  return field === 'weatherCode' ? point.weatherCode === null : point[field].value === null;
}

/** Complete les champs absents du point retenu par le modele le plus fin qui les fournit. */
function completePoint(
  bundle: ForecastBundle,
  index: number,
  point: HourlyPoint,
  model: ModelId,
): BlendedPoint {
  const filledFrom: Partial<Record<FillableField, ModelId>> = {};
  const completed: Record<string, unknown> = { ...point };
  for (const field of FILLABLE_FIELDS) {
    if (!isMissing(point, field)) {
      continue;
    }
    for (const donor of MODEL_ORDER) {
      const candidate = donor === model ? undefined : bundle.series[donor]?.hourly[index];
      if (candidate === undefined || isMissing(candidate, field)) {
        continue;
      }
      completed[field] =
        field === 'weatherCode' ? candidate.weatherCode : (candidate[field] satisfies Measure);
      filledFrom[field] = donor;
      break;
    }
  }
  return { ...(completed as unknown as HourlyPoint), model, filledFrom };
}

/** Point de la cascade a un index de timeline ; null hors cascade ou serie absente. */
export function blendedPointAt(
  bundle: ForecastBundle,
  segments: readonly CascadeSegment[],
  index: number,
): BlendedPoint | null {
  const model = modelAt(segments, index);
  if (model === null) {
    return null;
  }
  const point = bundle.series[model]?.hourly[index];
  return point === undefined ? null : completePoint(bundle, index, point, model);
}

/** Serie fusionnee selon la cascade, pour l'affichage par defaut. */
export function blendByCascade(
  bundle: ForecastBundle,
  segments: readonly CascadeSegment[],
): readonly BlendedPoint[] {
  const blended: BlendedPoint[] = [];
  for (const segment of segments) {
    const series = bundle.series[segment.model];
    if (series === undefined) {
      continue;
    }
    for (let i = segment.startIndex; i <= segment.endIndex; i += 1) {
      const point = series.hourly[i];
      if (point !== undefined) {
        blended.push(completePoint(bundle, i, point, segment.model));
      }
    }
  }
  return blended;
}

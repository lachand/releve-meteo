import { CASCADE_BOUNDS_HOURS } from './constants';
import { leadHoursFrom } from './time';
import type { ForecastBundle, HourlyPoint, LocalIsoHour, ModelId } from './types';

export interface CascadeSegment {
  readonly model: ModelId;
  readonly startIndex: number; // inclusif, index dans timeline
  readonly endIndex: number; // inclusif
}

const CASCADE_ORDER: readonly ModelId[] = ['arome', 'arpege', 'icon_eu', 'gfs'];

function boundHoursFor(model: ModelId): number {
  switch (model) {
    case 'arome':
      return CASCADE_BOUNDS_HOURS.aromeMax;
    case 'arpege':
      return CASCADE_BOUNDS_HOURS.arpegeMax;
    case 'icon_eu':
    case 'gfs':
      return CASCADE_BOUNDS_HOURS.mediumRangeMax;
  }
}

/**
 * Retourne le modele a utiliser pour une echeance donnee, ou null si
 * aucun modele disponible ne couvre cette echeance.
 * Bornes: leadHours <= 36 -> arome, <= 96 -> arpege, <= 168 -> icon_eu puis gfs.
 *
 * Repli a l'interieur d'une tranche : si le modele nominal est absent,
 * prend le suivant dans l'ordre arome/arpege/icon_eu/gfs qui couvre encore
 * l'echeance. Ne remonte jamais vers un modele plus fin que l'echeance ne
 * le permet.
 */
export function selectModelForLeadTime(
  leadHours: number,
  available: readonly ModelId[],
): ModelId | null {
  if (leadHours < 0 || leadHours > CASCADE_BOUNDS_HOURS.mediumRangeMax) {
    return null;
  }
  const nominalIndex = CASCADE_ORDER.findIndex((model) => leadHours <= boundHoursFor(model));
  // gfs couvre jusqu'a mediumRangeMax et leadHours y est deja borne ci-dessus :
  // findIndex trouve toujours un modele nominal, ce -1 est structurel plutot
  // qu'atteignable.
  /* v8 ignore next 3 */
  if (nominalIndex === -1) {
    return null;
  }
  for (let i = nominalIndex; i < CASCADE_ORDER.length; i += 1) {
    const model = CASCADE_ORDER[i];
    if (model !== undefined && available.includes(model)) {
      return model;
    }
  }
  return null;
}

/**
 * Decoupe la timeline en segments contigus par modele.
 * Les segments sont ordonnes, sans chevauchement, et couvrent la timeline
 * sauf les echeances sans modele disponible qui sont simplement omises.
 */
export function buildCascade(
  timeline: readonly LocalIsoHour[],
  now: Date,
  available: readonly ModelId[],
): readonly CascadeSegment[] {
  const segments: CascadeSegment[] = [];
  for (const [index, point] of timeline.entries()) {
    const model = selectModelForLeadTime(leadHoursFrom(now, point), available);
    if (model === null) {
      continue;
    }
    const last = segments.at(-1);
    if (last !== undefined && last.model === model && last.endIndex === index - 1) {
      segments[segments.length - 1] = { ...last, endIndex: index };
    } else {
      segments.push({ model, startIndex: index, endIndex: index });
    }
  }
  return segments;
}

/** Index de timeline ou le modele change. Utilise pour dessiner les marqueurs. */
export function transitionIndices(segments: readonly CascadeSegment[]): readonly number[] {
  return segments.slice(1).map((segment) => segment.startIndex);
}

/** Serie fusionnee selon la cascade, pour l'affichage par defaut. */
export function blendByCascade(
  bundle: ForecastBundle,
  segments: readonly CascadeSegment[],
): readonly (HourlyPoint & { readonly model: ModelId })[] {
  const blended: (HourlyPoint & { readonly model: ModelId })[] = [];
  for (const segment of segments) {
    const series = bundle.series[segment.model];
    if (series === undefined) {
      continue;
    }
    for (let i = segment.startIndex; i <= segment.endIndex; i += 1) {
      const point = series.hourly[i];
      if (point !== undefined) {
        blended.push({ ...point, model: segment.model });
      }
    }
  }
  return blended;
}

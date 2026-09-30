import type { AlertPoint } from './alerts';
import { leadHoursFrom } from './time';

/*
 * Resume des 24 prochaines heures d'un lieu, pour les comparer d'un coup
 * d'oeil (tableau des favoris). Les valeurs viennent du modele retenu
 * heure par heure. Une grandeur sans aucune valeur reste null, jamais 0.
 */

export const DIGEST_HOURS = 24;

export interface DayDigest {
  readonly tempMin: number | null;
  readonly tempMax: number | null;
  /** Cumul de pluie, mm. */
  readonly rainMm: number | null;
  /** Rafale maximale, km/h. */
  readonly gustMax: number | null;
}

function known(values: readonly (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null);
}

export function dayDigest(input: {
  readonly points: readonly AlertPoint[];
  readonly now: Date;
}): DayDigest | null {
  const upcoming = input.points.filter((point) => {
    const lead = leadHoursFrom(input.now, point.time);
    return lead >= -1 && lead <= DIGEST_HOURS;
  });
  if (upcoming.length === 0) {
    return null;
  }
  const temperatures = known(upcoming.map((point) => point.temperature.value));
  const rain = known(upcoming.map((point) => point.precipitation.value));
  const gusts = known(upcoming.map((point) => point.windGust.value));
  return {
    tempMin: temperatures.length === 0 ? null : Math.min(...temperatures),
    tempMax: temperatures.length === 0 ? null : Math.max(...temperatures),
    rainMm: rain.length === 0 ? null : rain.reduce((sum, value) => sum + value, 0),
    gustMax: gusts.length === 0 ? null : Math.max(...gusts),
  };
}

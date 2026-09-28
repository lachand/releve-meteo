import { leadHoursFrom } from './time';
import type { LocalIsoHour } from './types';

/*
 * Resume du nowcast (ROADMAP.md B3) : « pluie dans 25 min », « fin de la
 * pluie vers 14h30 ». Pas de 15 min, AROME 1,3 km.
 */

/** Seuil de pluie perceptible sur un quart d'heure, mm. */
export const NOWCAST_RAIN_MM = 0.1;

export type NowcastSummary =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'dry'; readonly horizonMinutes: number }
  | { readonly kind: 'starting'; readonly inMinutes: number; readonly peakMm: number }
  | {
      readonly kind: 'ongoing';
      readonly stopsInMinutes: number | null;
      readonly peakMm: number;
    };

/**
 * Considere uniquement les quarts d'heure futurs ou en cours (le quart
 * d'heure qui contient `now`). Un null interrompt l'analyse : on ne
 * suppose jamais qu'une valeur absente est seche.
 */
export function summarizeNowcast(
  times: readonly LocalIsoHour[],
  values: readonly (number | null)[],
  now: Date,
): NowcastSummary {
  const upcoming: { minutes: number; value: number }[] = [];
  for (const [index, time] of times.entries()) {
    const minutes = leadHoursFrom(now, time) * 60;
    // Un pas de 15 min couvre [t, t+15) : le pas courant a un debut
    // jusqu'a 15 min dans le passe.
    if (minutes <= -15) {
      continue;
    }
    const value = values[index] ?? null;
    if (value === null) {
      break;
    }
    upcoming.push({ minutes: Math.max(0, Math.round(minutes)), value });
  }
  const first = upcoming[0];
  const last = upcoming.at(-1);
  if (first === undefined || last === undefined) {
    return { kind: 'unavailable' };
  }
  const wet = upcoming.filter((step) => step.value >= NOWCAST_RAIN_MM);
  const firstWet = wet[0];
  if (firstWet === undefined) {
    return { kind: 'dry', horizonMinutes: last.minutes + 15 };
  }
  const peakMm = Math.max(...wet.map((step) => step.value));
  if (first.value >= NOWCAST_RAIN_MM) {
    const dryStep = upcoming.find((step) => step.value < NOWCAST_RAIN_MM);
    return { kind: 'ongoing', stopsInMinutes: dryStep?.minutes ?? null, peakMm };
  }
  return { kind: 'starting', inMinutes: firstWet.minutes, peakMm };
}

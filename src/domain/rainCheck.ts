import type { StationRecord } from './stationCheck';
import { leadHoursFrom } from './time';
import type { HourlyPoint, LocalIsoHour, ModelId } from './types';

/*
 * Pluie reellement tombee : le cumul mesure a la station sur les dernieres 24
 * heures, face au cumul que le modele retenu calcule au lieu sur les memes
 * heures. Seules comptent les heures ou la station et le modele ont chacun
 * une valeur : une heure sans mesure n'est jamais un zero, elle est comptee a
 * part et dite. Ni l'un ni l'autre ne vaut « la verite » : la station est
 * a quelques kilometres du lieu, et une averse y passe ou non.
 */

export const RAIN_CHECK = {
  /** Fenetre, en heures. */
  hours: 24,
  /** Heures appariees minimales pour annoncer un cumul. */
  minPaired: 12,
} as const;

export interface RainCheck {
  readonly model: ModelId;
  /** Heures de la fenetre ou la mesure et le calcul existent tous deux. */
  readonly paired: number;
  /** Heures de la fenetre sans mesure de pluie a la station. */
  readonly missing: number;
  /** Cumul mesure sur les heures appariees, mm. */
  readonly observedMm: number;
  /** Cumul calcule par le modele sur les memes heures, mm. */
  readonly forecastMm: number;
}

export function rainCheck(input: {
  readonly records: readonly StationRecord[];
  readonly model: ModelId;
  /** Heures du modele retenu, passees comprises (derniere execution). */
  readonly hourly: readonly HourlyPoint[];
  readonly now: Date;
}): RainCheck | null {
  const observed = new Map<LocalIsoHour, number | null>(
    input.records.map((record) => [record.time, record.precipitation.value]),
  );
  let paired = 0;
  let missing = 0;
  let observedMm = 0;
  let forecastMm = 0;
  for (const point of input.hourly) {
    const lead = leadHoursFrom(input.now, point.time);
    if (lead > 0 || lead <= -RAIN_CHECK.hours) {
      continue;
    }
    const measured = observed.get(point.time) ?? null;
    if (measured === null) {
      missing += 1;
      continue;
    }
    const calculated = point.precipitation.value;
    if (calculated !== null) {
      paired += 1;
      observedMm += measured;
      forecastMm += calculated;
    }
  }
  if (paired < RAIN_CHECK.minPaired) {
    return null;
  }
  return { model: input.model, paired, missing, observedMm, forecastMm };
}

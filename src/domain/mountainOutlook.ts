import type { AlertPoint } from './alerts';
import { leadHoursFrom } from './time';
import type { LocalIsoHour, ModelId } from './types';

/*
 * Vue montagne : ou passe l'isotherme 0 °C par rapport au lieu, et combien
 * de neige les modeles annoncent. Les valeurs viennent du modele retenu
 * heure par heure, et ce modele est nomme. Une neige sans aucune valeur
 * reste inconnue (null), jamais 0 cm.
 */

export const MOUNTAIN = {
  /** Fenetre du cumul de neige, heures. */
  snowHours: 72,
  /** Fenetre des extremes de l'isotherme, heures. */
  freezingHours: 48,
} as const;

export interface MountainOutlook {
  /** Altitude de l'isotherme 0 °C a l'heure retenue, m. */
  readonly freezingNow: number | null;
  /** Isotherme moins altitude du lieu, m : positif = 0 °C au-dessus de vous. */
  readonly relativeNow: number | null;
  readonly freezingMin: number | null;
  readonly freezingMax: number | null;
  readonly freezingModel: ModelId | null;
  /** Cumul de neige sur MOUNTAIN.snowHours, cm ; null sans aucune valeur. */
  readonly snowCm: number | null;
  /** Heures avec neige. */
  readonly snowHours: number;
  readonly firstSnow: LocalIsoHour | null;
  readonly snowModels: readonly ModelId[];
}

export function mountainOutlook(input: {
  readonly points: readonly AlertPoint[];
  readonly now: Date;
  readonly elevation: number;
}): MountainOutlook | null {
  const upcoming = input.points.filter((point) => {
    const lead = leadHoursFrom(input.now, point.time);
    return lead >= -1 && lead <= MOUNTAIN.snowHours;
  });
  const first = upcoming[0];
  if (first === undefined) {
    return null;
  }

  const freezingValues = upcoming
    .filter((point) => leadHoursFrom(input.now, point.time) <= MOUNTAIN.freezingHours)
    .flatMap((point) => (point.freezingLevel.value === null ? [] : [point.freezingLevel.value]));
  const freezingNow = first.freezingLevel.value;

  const snowy = upcoming.filter((point) => (point.snowfall.value ?? 0) > 0);
  const snowValues = upcoming.flatMap((point) =>
    point.snowfall.value === null ? [] : [point.snowfall.value],
  );
  const snowModels = snowy.reduce<ModelId[]>((list, point) => {
    const model = point.filledFrom?.snowfall ?? point.model;
    return list.includes(model) ? list : [...list, model];
  }, []);

  return {
    freezingNow,
    relativeNow: freezingNow === null ? null : freezingNow - input.elevation,
    freezingMin: freezingValues.length === 0 ? null : Math.min(...freezingValues),
    freezingMax: freezingValues.length === 0 ? null : Math.max(...freezingValues),
    freezingModel: freezingNow === null ? null : (first.filledFrom?.freezingLevel ?? first.model),
    snowCm: snowValues.length === 0 ? null : snowValues.reduce((sum, value) => sum + value, 0),
    snowHours: snowy.length,
    firstSnow: snowy[0]?.time ?? null,
    snowModels,
  };
}

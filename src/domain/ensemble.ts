import { leadHoursFrom } from './time';
import type { LocalIsoHour } from './types';

/*
 * Prevision probabiliste longue echeance (ROADMAP.md B2) a partir des
 * membres d'ensemble Open-Meteo (ECMWF ENS, ICON-EPS, GFS-ENS). Chaque
 * membre est une trajectoire plausible : leur dispersion mesure
 * l'incertitude, bien mieux qu'un ecart entre 4 modeles deterministes
 * au-dela de 5 jours.
 */

export type EnsembleSystem = 'ecmwf_ens' | 'icon_eps' | 'gfs_ens';

export interface Quantiles {
  readonly min: number;
  readonly p10: number;
  readonly p25: number;
  readonly median: number;
  readonly p75: number;
  readonly p90: number;
  readonly max: number;
}

/** Membres horaires : `members[m][i]` = membre m, heure i de `timeline`. */
export interface EnsembleHourly {
  readonly timeline: readonly LocalIsoHour[];
  readonly temperature: readonly (readonly (number | null)[])[];
  readonly precipitation: readonly (readonly (number | null)[])[];
  readonly windGust: readonly (readonly (number | null)[])[];
}

export interface EnsembleDay {
  readonly date: string; // 'YYYY-MM-DD'
  readonly tempMax: Quantiles | null;
  readonly tempMin: Quantiles | null;
  readonly precipitation: Quantiles | null;
  /** Part des membres annoncant au moins 1 mm sur la journee, [0, 1]. */
  readonly rainProbability: number | null;
  /** Part des membres annoncant au moins 10 mm sur la journee, [0, 1]. */
  readonly heavyRainProbability: number | null;
  /** Part des membres dont le minimum du jour est a 0 °C ou moins, [0, 1]. */
  readonly frostProbability: number | null;
  /** Part des membres dont la rafale maximale atteint ENSEMBLE_GUST_KMH ; null sans rafale d'ensemble. */
  readonly gustProbability: number | null;
  /** Nombre de membres ayant une journee complete. */
  readonly memberCount: number;
}

export const ENSEMBLE_RAIN_DAY_MM = 1;
export const ENSEMBLE_HEAVY_RAIN_DAY_MM = 10;
/** Rafale au-dela de laquelle le vent est fort (meme seuil que la fleche de vent), km/h. */
export const ENSEMBLE_GUST_KMH = 60;
/** Heures valides minimales pour qu'une journee de membre compte. */
const MIN_HOURS_PER_DAY = 20;

/** Quantile par interpolation lineaire (methode 7 de Hyndman et Fan, celle de R et numpy). */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = valueAt(sorted, lower);
  return lowerValue + (valueAt(sorted, upper) - lowerValue) * (position - lower);
}

/** Lecture d'un index que l'appelant garantit dans [0, length - 1]. */
function valueAt(sorted: readonly number[], index: number): number {
  const value = sorted[index];
  // Indices calcules dans les bornes par construction : ce repli ne sert
  // qu'a satisfaire noUncheckedIndexedAccess, il n'est pas atteignable.
  /* v8 ignore next */
  return value === undefined ? Number.NaN : value;
}

/** Quantiles d'un echantillon ; null si vide. Les null sont ignores. */
export function quantiles(values: readonly (number | null)[]): Quantiles | null {
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (known.length === 0) {
    return null;
  }
  const sorted = [...known].sort((a, b) => a - b);
  return {
    min: valueAt(sorted, 0),
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    max: valueAt(sorted, sorted.length - 1),
  };
}

function dateOf(time: LocalIsoHour): string {
  return time.slice(0, 10);
}

/** Probabilite (part des membres) qu'une valeur depasse un seuil. */
export function exceedanceProbability(
  values: readonly (number | null)[],
  threshold: number,
): number | null {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) {
    return null;
  }
  return known.filter((v) => v >= threshold).length / known.length;
}

/**
 * Agregation journaliere : pour chaque membre, max/min de temperature et
 * cumul de pluie du jour ; puis quantiles sur les membres. Une journee de
 * membre avec trop d'heures manquantes est ignoree plutot que completee
 * par des zeros.
 */
export function dailyEnsemble(hourly: EnsembleHourly): readonly EnsembleDay[] {
  const dayIndices = new Map<string, number[]>();
  for (const [index, time] of hourly.timeline.entries()) {
    const date = dateOf(time);
    const list = dayIndices.get(date);
    if (list === undefined) {
      dayIndices.set(date, [index]);
    } else {
      list.push(index);
    }
  }

  const days: EnsembleDay[] = [];
  for (const [date, indices] of dayIndices) {
    const maxima: number[] = [];
    const minima: number[] = [];
    const sums: number[] = [];
    const gusts: number[] = [];
    for (const member of hourly.temperature) {
      const values = indices.map((i) => member[i] ?? null).filter((v): v is number => v !== null);
      if (values.length >= Math.min(MIN_HOURS_PER_DAY, indices.length)) {
        maxima.push(Math.max(...values));
        minima.push(Math.min(...values));
      }
    }
    for (const member of hourly.precipitation) {
      const values = indices.map((i) => member[i] ?? null).filter((v): v is number => v !== null);
      if (values.length >= Math.min(MIN_HOURS_PER_DAY, indices.length)) {
        sums.push(values.reduce((sum, v) => sum + v, 0));
      }
    }
    for (const member of hourly.windGust) {
      const values = indices.map((i) => member[i] ?? null).filter((v): v is number => v !== null);
      if (values.length >= Math.min(MIN_HOURS_PER_DAY, indices.length)) {
        gusts.push(Math.max(...values));
      }
    }
    // Journee tronquee en bout d'horizon (moins de MIN_HOURS_PER_DAY
    // heures dans la timeline) : ignoree, un max sur 3 heures tromperait.
    if (indices.length < MIN_HOURS_PER_DAY) {
      continue;
    }
    days.push({
      date,
      tempMax: quantiles(maxima),
      tempMin: quantiles(minima),
      precipitation: quantiles(sums),
      rainProbability: exceedanceProbability(sums, ENSEMBLE_RAIN_DAY_MM),
      heavyRainProbability: exceedanceProbability(sums, ENSEMBLE_HEAVY_RAIN_DAY_MM),
      // Gel : minimum <= 0 °C, soit -minimum >= 0.
      frostProbability: exceedanceProbability(
        minima.map((minimum) => -minimum),
        0,
      ),
      gustProbability: exceedanceProbability(gusts, ENSEMBLE_GUST_KMH),
      memberCount: Math.max(maxima.length, sums.length),
    });
  }
  return days;
}

/** Quantiles horaires de temperature, pour l'eventail des 15 jours. */
export function hourlyQuantiles(
  members: readonly (readonly (number | null)[])[],
  length: number,
): readonly (Quantiles | null)[] {
  const result: (Quantiles | null)[] = [];
  for (let i = 0; i < length; i += 1) {
    result.push(quantiles(members.map((member) => member[i] ?? null)));
  }
  return result;
}

/** Probabilite horaire de pluie (>= seuil mm/h) sur les membres. */
export function hourlyRainProbability(
  members: readonly (readonly (number | null)[])[],
  length: number,
  thresholdMm = 0.1,
): readonly (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < length; i += 1) {
    result.push(
      exceedanceProbability(
        members.map((member) => member[i] ?? null),
        thresholdMm,
      ),
    );
  }
  return result;
}

/** Fenetre de la pluie probable heure par heure, heures. */
export const RAIN_OUTLOOK_HOURS = 72;

export interface RainOutlookHour {
  readonly time: LocalIsoHour;
  /** Part des membres qui annoncent de la pluie (0,1 mm ou plus) cette heure, [0, 1]. */
  readonly probability: number | null;
  /** Cumul median des membres, mm ; null sans valeur. */
  readonly median: number | null;
  /** Cumul atteint ou depasse par 1 membre sur 10, mm : le cas defavorable plausible. */
  readonly p90: number | null;
  /** Membres ayant une valeur cette heure. */
  readonly memberCount: number;
}

/**
 * Pluie probable heure par heure sur les prochaines heures, d'apres les
 * membres de l'ensemble. Une heure sans aucun membre reste vide (null), jamais
 * comptee comme sechee.
 */
export function rainOutlook(input: {
  readonly ensemble: EnsembleHourly;
  readonly now: Date;
  readonly hours?: number;
}): readonly RainOutlookHour[] {
  const { ensemble } = input;
  const horizon = input.hours ?? RAIN_OUTLOOK_HOURS;
  if (ensemble.precipitation.length === 0) {
    return [];
  }
  return ensemble.timeline.flatMap((time, index): RainOutlookHour[] => {
    const lead = leadHoursFrom(input.now, time);
    if (lead < -1 || lead > horizon) {
      return [];
    }
    const values = ensemble.precipitation.map((member) => member[index] ?? null);
    const spread = quantiles(values);
    return [
      {
        time,
        probability: exceedanceProbability(values, 0.1),
        median: spread?.median ?? null,
        p90: spread?.p90 ?? null,
        memberCount: values.filter((v) => v !== null).length,
      },
    ];
  });
}

/** Fenetre des trajectoires de temperature de l'ensemble, heures. */
export const SPAGHETTI_HOURS = 72;

export interface TemperatureSpaghetti {
  readonly times: readonly LocalIsoHour[];
  /** `members[m][i]` : membre m, heure `times[i]`, °C ; null sans valeur. */
  readonly members: readonly (readonly (number | null)[])[];
  /** Mediane des membres a chaque heure, °C ; null sans membre. */
  readonly median: readonly (number | null)[];
  /** Neuf membres sur dix sont entre ces deux courbes, °C. */
  readonly p10: readonly (number | null)[];
  readonly p90: readonly (number | null)[];
  /** Heure la plus lointaine ou la dispersion est connue, avec son etalement p10-p90 ; null sans donnee. */
  readonly widest: {
    readonly time: LocalIsoHour;
    readonly p10: number;
    readonly p90: number;
  } | null;
}

/**
 * Trajectoires de temperature de chaque membre de l'ensemble sur les
 * prochaines heures, avec leur mediane et le fuseau qui contient neuf membres
 * sur dix. Une heure sans valeur reste vide (null) : jamais une trajectoire
 * qui retombe a zero.
 */
export function temperatureSpaghetti(input: {
  readonly ensemble: EnsembleHourly;
  readonly now: Date;
  readonly hours?: number;
}): TemperatureSpaghetti | null {
  const { ensemble } = input;
  const horizon = input.hours ?? SPAGHETTI_HOURS;
  const indexes = ensemble.timeline.flatMap((time, index) => {
    const lead = leadHoursFrom(input.now, time);
    return lead >= -1 && lead <= horizon ? [index] : [];
  });
  if (ensemble.temperature.length === 0 || indexes.length === 0) {
    return null;
  }
  const times = indexes.map((index) => ensemble.timeline[index] as LocalIsoHour);
  const members = ensemble.temperature.map((member) =>
    indexes.map((index) => member[index] ?? null),
  );
  const spread = indexes.map((index) =>
    quantiles(ensemble.temperature.map((member) => member[index] ?? null)),
  );
  const lastKnown = spread.reduce((found, q, index) => (q === null ? found : index), -1);
  const last = lastKnown === -1 ? null : spread[lastKnown];
  return {
    times,
    members,
    median: spread.map((q) => q?.median ?? null),
    p10: spread.map((q) => q?.p10 ?? null),
    p90: spread.map((q) => q?.p90 ?? null),
    widest:
      last === null || last === undefined
        ? null
        : { time: times[lastKnown] as LocalIsoHour, p10: last.p10, p90: last.p90 },
  };
}

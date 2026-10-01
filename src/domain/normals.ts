/*
 * Normales de saison : la moyenne, sur 1991-2020, des temperatures maximale
 * et minimale autour d'une date, pour dire si la prevision est au-dessus ou
 * au-dessous de ce qui est habituel. Les valeurs viennent de la reanalyse
 * ERA5 : une estimation sur une maille d'environ 30 km, jamais une mesure.
 */

export const NORMALS = {
  /** Jours de part et d'autre de la date inclus dans la moyenne. */
  halfWindowDays: 3,
  /** Annees avec au moins quelques valeurs pour parler de normale. */
  minYears: 20,
  /** Premiere et derniere annee de la periode de reference. */
  periodStart: 1991,
  periodEnd: 2020,
} as const;

/** Maxima et minima quotidiens d'une longue periode, une valeur par date. */
export interface ClimateDaily {
  /** Dates 'AAAA-MM-JJ'. */
  readonly dates: readonly string[];
  readonly tempMax: readonly (number | null)[];
  readonly tempMin: readonly (number | null)[];
}

export interface DayNormal {
  readonly tempMax: number;
  readonly tempMin: number;
  /** Annees qui ont contribue a la moyenne. */
  readonly years: number;
}

const CUMULATIVE_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334] as const;

/** Rang du jour dans une annee de 365 jours (le 29 fevrier compte comme le 28), ou null. */
function dayRank(monthDay: string): number | null {
  const match = /^(\d{2})-(\d{2})$/.exec(monthDay);
  if (match === null) {
    return null;
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const offset = CUMULATIVE_DAYS[month - 1];
  if (offset === undefined || day < 1 || day > 31) {
    return null;
  }
  return offset + (monthDay === '02-29' ? 28 : day) - 1;
}

/**
 * Normale du jour `monthDay` ('MM-JJ') : moyenne des maxima et des minima des
 * jours situes a `halfWindowDays` ou moins, sur toute la periode. Le 29 fevrier
 * des annees bissextiles est ignore. null sans assez d'annees ou de valeurs.
 */
export function dayNormal(climate: ClimateDaily, monthDay: string): DayNormal | null {
  const target = dayRank(monthDay);
  if (target === null) {
    return null;
  }
  let maxSum = 0;
  let maxCount = 0;
  let minSum = 0;
  let minCount = 0;
  const years = new Set<string>();
  for (const [index, date] of climate.dates.entries()) {
    const md = date.slice(5);
    if (md === '02-29') {
      continue;
    }
    const rank = dayRank(md);
    if (rank === null) {
      continue;
    }
    const gap = Math.abs(rank - target);
    if (Math.min(gap, 365 - gap) > NORMALS.halfWindowDays) {
      continue;
    }
    const high = climate.tempMax[index] ?? null;
    const low = climate.tempMin[index] ?? null;
    if (high !== null) {
      maxSum += high;
      maxCount += 1;
      years.add(date.slice(0, 4));
    }
    if (low !== null) {
      minSum += low;
      minCount += 1;
    }
  }
  if (maxCount === 0 || minCount === 0 || years.size < NORMALS.minYears) {
    return null;
  }
  return { tempMax: maxSum / maxCount, tempMin: minSum / minCount, years: years.size };
}

export interface Anomaly {
  /** Maximum prevu moins maximum normal, °C ; null sans prevision. */
  readonly max: number | null;
  readonly min: number | null;
}

/** Ecart d'une prevision a la normale, signe ; une valeur absente reste null. */
export function anomalyAgainst(
  forecast: { readonly tempMax: number | null; readonly tempMin: number | null },
  normal: DayNormal,
): Anomaly {
  return {
    max: forecast.tempMax === null ? null : forecast.tempMax - normal.tempMax,
    min: forecast.tempMin === null ? null : forecast.tempMin - normal.tempMin,
  };
}

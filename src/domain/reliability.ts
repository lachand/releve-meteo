import { RELIABILITY } from './constants';
import { utcMsFromLocalIso } from './time';
import type { LocalIsoHour, ModelId, Provenance, WeatherVariable } from './types';

/*
 * Verification des modeles contre le reel (ROADMAP.md phase C).
 *
 * Deux sources d'appariement :
 *  - les executions passees publiees par Open-Meteo (Previous Runs API),
 *    qui donnent pour chaque heure passee la valeur prevue J-1, J-2, J-3 :
 *    la verification est disponible des la premiere visite ;
 *  - l'archive locale (`ArchivedForecast`), alimentee a chaque consultation,
 *    qui prolonge la fenetre et couvre les echeances intermediaires.
 *
 * La reference ("le reel") porte sa provenance : 'observed' pour une
 * station, 'estimated' pour une reanalyse. Le domaine ne tranche pas : il
 * calcule, l'interface dit contre quoi.
 */

export interface ArchivedForecast {
  readonly placeId: string;
  readonly model: ModelId;
  readonly variable: WeatherVariable;
  readonly targetTime: LocalIsoHour;
  readonly predicted: number;
  readonly issuedAt: number; // epoch ms
  readonly leadHours: number;
}

export interface ReliabilitySample {
  readonly archived: ArchivedForecast;
  readonly observed: number;
}

export interface ReliabilityScore {
  readonly model: ModelId;
  readonly variable: WeatherVariable;
  readonly mae: number | null; // erreur absolue moyenne
  readonly bias: number | null; // erreur moyenne signee (prevu - reel)
  readonly sampleCount: number;
  readonly status: 'ready' | 'collecting';
}

/** Une paire prevu / reel, sans hypothese sur son origine. */
export interface VerificationPair {
  readonly predicted: number | null;
  readonly observed: number | null;
  /** Heure locale de la paire, quand elle est connue (biais par moment de la journee). */
  readonly time?: LocalIsoHour;
}

export interface ErrorStats {
  readonly mae: number;
  readonly bias: number;
  readonly rmse: number;
  readonly count: number;
}

export interface DayPeriod {
  readonly key: 'night' | 'morning' | 'afternoon' | 'evening';
  /** Complete « ... trop chaud » : « la nuit », « l'apres-midi ». */
  readonly label: string;
  /** Premiere et derniere heures locales incluses. */
  readonly from: number;
  readonly to: number;
}

export const DAY_PERIODS: readonly DayPeriod[] = [
  { key: 'night', label: 'la nuit', from: 0, to: 5 },
  { key: 'morning', label: 'le matin', from: 6, to: 11 },
  { key: 'afternoon', label: 'l’après-midi', from: 12, to: 17 },
  { key: 'evening', label: 'le soir', from: 18, to: 23 },
];

export const PERIOD_BIAS = {
  /** Paires minimales par moment de la journee : en deca, pas de biais annonce. */
  minPairs: 8,
} as const;

export interface PeriodBias {
  readonly period: DayPeriod;
  readonly count: number;
  /** Ecart moyen signe (prevu moins reel) sur ce moment de la journee. */
  readonly bias: number;
}

/**
 * Ecart moyen par moment de la journee (nuit, matin, apres-midi, soir). Les
 * paires sans heure ou dont un terme manque sont ignorees, jamais comptees
 * comme zero ; un moment sous le minimum de paires est omis ; null s'il n'en
 * reste aucun.
 */
export function biasByPeriod(pairs: readonly VerificationPair[]): readonly PeriodBias[] | null {
  const result: PeriodBias[] = [];
  for (const period of DAY_PERIODS) {
    const gaps: number[] = [];
    for (const pair of pairs) {
      if (pair.time === undefined || pair.predicted === null || pair.observed === null) {
        continue;
      }
      const hour = Number(pair.time.slice(11, 13));
      if (hour >= period.from && hour <= period.to) {
        gaps.push(pair.predicted - pair.observed);
      }
    }
    if (gaps.length >= PERIOD_BIAS.minPairs) {
      result.push({
        period,
        count: gaps.length,
        bias: gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length,
      });
    }
  }
  return result.length === 0 ? null : result;
}

export const DAILY_ERRORS = {
  /** Paires minimales dans une journee : en deca, la journee n'est pas comptee. */
  minPairs: 6,
  /** Longueur de la fenetre « ces derniers jours » et de celle d'avant, en jours. */
  windowDays: 7,
  /** Journees comptees minimales par fenetre et par modele pour le designer. */
  minDays: 4,
} as const;

export interface DailyError {
  /** Jour local, 'YYYY-MM-DD'. */
  readonly date: string;
  /** Erreur absolue moyenne de la journee. */
  readonly mae: number;
  readonly count: number;
}

/**
 * Erreur absolue moyenne par jour local, du plus ancien au plus recent. Les
 * paires sans heure ou dont un terme manque sont ignorees, jamais comptees
 * comme zero ; une journee sous le minimum de paires est omise ; null s'il
 * n'en reste aucune.
 */
export function dailyErrors(pairs: readonly VerificationPair[]): readonly DailyError[] | null {
  const byDay = new Map<string, number[]>();
  for (const pair of pairs) {
    if (pair.time === undefined || pair.predicted === null || pair.observed === null) {
      continue;
    }
    const date = pair.time.slice(0, 10);
    const gaps = byDay.get(date) ?? [];
    gaps.push(Math.abs(pair.predicted - pair.observed));
    byDay.set(date, gaps);
  }
  const days: DailyError[] = [];
  for (const [date, gaps] of byDay) {
    if (gaps.length >= DAILY_ERRORS.minPairs) {
      days.push({
        date,
        mae: gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length,
        count: gaps.length,
      });
    }
  }
  days.sort((a, b) => (a.date < b.date ? -1 : 1));
  return days.length === 0 ? null : days;
}

export interface WeekLeader {
  readonly model: ModelId;
  readonly mae: number;
  /** Journees comptees dans la fenetre. */
  readonly days: number;
}

export interface WeeklyComparison {
  /** Dernier jour pris en compte, 'YYYY-MM-DD'. */
  readonly lastDate: string;
  /** Le plus juste sur les 7 derniers jours, null sans pair assez nombreux. */
  readonly recent: WeekLeader | null;
  /** Le plus juste sur les 7 jours d'avant. */
  readonly previous: WeekLeader | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(date: string): number {
  return Math.round(utcMsFromLocalIso(`${date}T00:00` as LocalIsoHour) / DAY_MS);
}

function leaderOf(
  rows: readonly { readonly model: ModelId; readonly daily: readonly DailyError[] }[],
  from: number,
  to: number,
): WeekLeader | null {
  const candidates: WeekLeader[] = [];
  for (const { model, daily } of rows) {
    const inside = daily.filter((d) => {
      const n = dayNumber(d.date);
      return n >= from && n <= to;
    });
    if (inside.length < DAILY_ERRORS.minDays) {
      continue;
    }
    const count = inside.reduce((sum, d) => sum + d.count, 0);
    const mae = inside.reduce((sum, d) => sum + d.mae * d.count, 0) / count;
    candidates.push({ model, mae, days: inside.length });
  }
  // Un seul modele eligible n'est le « plus juste » de personne.
  if (candidates.length < 2) {
    return null;
  }
  return candidates.reduce((best, c) => (c.mae < best.mae ? c : best));
}

/**
 * Le modele le plus juste sur les 7 derniers jours et sur les 7 d'avant, a
 * partir des erreurs journalieres de chaque modele. null quand ni l'une ni
 * l'autre fenetre n'a de designe.
 */
export function weeklyComparison(
  rows: readonly { readonly model: ModelId; readonly daily: readonly DailyError[] }[],
): WeeklyComparison | null {
  const dates = rows.flatMap((row) => row.daily.map((d) => d.date));
  if (dates.length === 0) {
    return null;
  }
  const lastDate = dates.reduce((a, b) => (a > b ? a : b));
  const last = dayNumber(lastDate);
  const span = DAILY_ERRORS.windowDays;
  const recent = leaderOf(rows, last - span + 1, last);
  const previous = leaderOf(rows, last - 2 * span + 1, last - span);
  return recent === null && previous === null ? null : { lastDate, recent, previous };
}

/** Table de contingence pluie / sec, seuil en mm/h. */
export interface RainContingency {
  readonly hits: number;
  readonly misses: number;
  readonly falseAlarms: number;
  readonly correctNegatives: number;
  /** Proportion de bonnes reponses, null si aucun echantillon. */
  readonly accuracy: number | null;
  /** Score de Heidke (HSS), null si non defini (denominateur nul). */
  readonly heidke: number | null;
}

/** Seuil de pluie significative pour la table de contingence, mm par heure. */
export const RAIN_EVENT_THRESHOLD_MM = 0.2;

/**
 * Statistiques d'erreur sur les paires completes. Les paires dont l'un des
 * deux termes est null sont ignorees, jamais comptees comme zero.
 */
export function errorStats(pairs: readonly VerificationPair[]): ErrorStats | null {
  let count = 0;
  let sumAbs = 0;
  let sum = 0;
  let sumSq = 0;
  for (const { predicted, observed } of pairs) {
    if (predicted === null || observed === null) {
      continue;
    }
    const error = predicted - observed;
    count += 1;
    sumAbs += Math.abs(error);
    sum += error;
    sumSq += error * error;
  }
  if (count === 0) {
    return null;
  }
  return { mae: sumAbs / count, bias: sum / count, rmse: Math.sqrt(sumSq / count), count };
}

export function rainContingency(
  pairs: readonly VerificationPair[],
  thresholdMm: number = RAIN_EVENT_THRESHOLD_MM,
): RainContingency {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctNegatives = 0;
  for (const { predicted, observed } of pairs) {
    if (predicted === null || observed === null) {
      continue;
    }
    const forecastRain = predicted >= thresholdMm;
    const observedRain = observed >= thresholdMm;
    if (forecastRain && observedRain) {
      hits += 1;
    } else if (!forecastRain && observedRain) {
      misses += 1;
    } else if (forecastRain && !observedRain) {
      falseAlarms += 1;
    } else {
      correctNegatives += 1;
    }
  }
  const total = hits + misses + falseAlarms + correctNegatives;
  const accuracy = total === 0 ? null : (hits + correctNegatives) / total;
  // HSS = 2(ad - bc) / ((a+c)(c+d) + (a+b)(b+d)), a=hits b=falseAlarms c=misses d=correctNegatives
  const a = hits;
  const b = falseAlarms;
  const c = misses;
  const d = correctNegatives;
  const denominator = (a + c) * (c + d) + (a + b) * (b + d);
  const heidke = denominator === 0 ? null : (2 * (a * d - b * c)) / denominator;
  return { hits, misses, falseAlarms, correctNegatives, accuracy, heidke };
}

/** Verification d'un modele pour une variable a une echeance donnee (en jours). */
export interface ModelVerification {
  readonly model: ModelId;
  readonly variable: WeatherVariable;
  /** Echeance en jours : 1 = prevision emise la veille. */
  readonly leadDays: number;
  readonly stats: ErrorStats | null;
  /** Renseigne pour la seule variable precipitation. */
  readonly rain: RainContingency | null;
  /** Biais par moment de la journee ; temperature seulement, une fois la verification prete. */
  readonly periods?: readonly PeriodBias[] | null;
  /** Erreur par jour ; temperature seulement, une fois la verification prete. */
  readonly daily?: readonly DailyError[] | null;
  readonly sampleCount: number;
  readonly status: 'ready' | 'collecting';
  /** Provenance de la reference comparee. */
  readonly reference: Provenance;
}

export function verifyModel(input: {
  readonly model: ModelId;
  readonly variable: WeatherVariable;
  readonly leadDays: number;
  readonly pairs: readonly VerificationPair[];
  readonly reference: Provenance;
  readonly minSamples?: number;
}): ModelVerification {
  const stats = errorStats(input.pairs);
  const sampleCount = stats?.count ?? 0;
  const ready = sampleCount >= (input.minSamples ?? RELIABILITY.minSamples);
  return {
    model: input.model,
    variable: input.variable,
    leadDays: input.leadDays,
    stats: ready ? stats : null,
    rain: ready && input.variable === 'precipitation' ? rainContingency(input.pairs) : null,
    periods: ready && input.variable === 'temperature' ? biasByPeriod(input.pairs) : null,
    daily: ready && input.variable === 'temperature' ? dailyErrors(input.pairs) : null,
    sampleCount,
    status: ready ? 'ready' : 'collecting',
    reference: input.reference,
  };
}

/**
 * Classement des modeles par MAE croissante pour une variable et une
 * echeance. Les modeles "en collecte" sont places en fin, dans l'ordre
 * d'entree.
 */
export function rankByError(
  verifications: readonly ModelVerification[],
): readonly ModelVerification[] {
  const ready = verifications.filter(
    (v): v is ModelVerification & { readonly stats: ErrorStats } => v.stats !== null,
  );
  const collecting = verifications.filter((v) => v.stats === null);
  ready.sort((a, b) => a.stats.mae - b.stats.mae);
  return [...ready, ...collecting];
}

/** status 'collecting' si sampleCount < RELIABILITY.minSamples, mae et bias a null. */
export function scoreFromSamples(
  model: ModelId,
  variable: WeatherVariable,
  samples: readonly ReliabilitySample[],
): ReliabilityScore {
  const stats = errorStats(
    samples.map((s) => ({ predicted: s.archived.predicted, observed: s.observed })),
  );
  const sampleCount = stats?.count ?? 0;
  if (stats === null || sampleCount < RELIABILITY.minSamples) {
    return { model, variable, mae: null, bias: null, sampleCount, status: 'collecting' };
  }
  return { model, variable, mae: stats.mae, bias: stats.bias, sampleCount, status: 'ready' };
}

/** Apparie les previsions archivees avec le realise. Les non apparies sont ignores. */
export function matchSamples(
  archived: readonly ArchivedForecast[],
  observed: ReadonlyMap<LocalIsoHour, number>,
): readonly ReliabilitySample[] {
  const samples: ReliabilitySample[] = [];
  for (const entry of archived) {
    const value = observed.get(entry.targetTime);
    if (value !== undefined) {
      samples.push({ archived: entry, observed: value });
    }
  }
  return samples;
}

/** Retire les entrees emises il y a plus de `retentionDays` jours. */
export function pruneArchive(
  entries: readonly ArchivedForecast[],
  now: Date,
  retentionDays: number,
): readonly ArchivedForecast[] {
  const limit = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return entries.filter((entry) => entry.issuedAt >= limit);
}

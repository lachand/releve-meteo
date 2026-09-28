import { RELIABILITY } from './constants';
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
}

export interface ErrorStats {
  readonly mae: number;
  readonly bias: number;
  readonly rmse: number;
  readonly count: number;
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

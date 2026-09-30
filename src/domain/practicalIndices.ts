import type { AlertPoint } from './alerts';
import { localIsoFromUtc, utcMsFromLocalIso } from './time';
import type { LocalIsoHour, ModelId } from './types';

/*
 * Indices pratiques (velo, randonnee, linge, jardinage) : des verdicts
 * derives de seuils nommes, jamais d'un score opaque. Chaque indice montre
 * ses criteres, la valeur qui a ete lue et les seuils qui l'ont classee ; le
 * modele qui fournit les heures est nomme. Une heure sans valeur rend le
 * critere inconnu, donc l'indice inconnu : on ne conclut pas sur des trous.
 * Les seuils sont des reperes d'usage, pas des normes.
 */

export type IndexId = 'cycling' | 'hiking' | 'laundry' | 'gardening';
export type CriterionKey = 'rain' | 'gust' | 'tempMin' | 'tempMax' | 'humidity' | 'wind';
export type Status = 'good' | 'fair' | 'poor';

/** `max` : la valeur doit rester sous le seuil ; `min` : elle doit l'atteindre. */
interface Threshold {
  readonly kind: 'max' | 'min';
  readonly good: number;
  readonly fair: number;
}

export const PRACTICAL_INDICES = {
  cycling: {
    rain: { kind: 'max', good: 0.5, fair: 2 },
    gust: { kind: 'max', good: 30, fair: 45 },
    tempMin: { kind: 'min', good: 8, fair: 2 },
    tempMax: { kind: 'max', good: 28, fair: 34 },
  },
  hiking: {
    rain: { kind: 'max', good: 1, fair: 5 },
    gust: { kind: 'max', good: 40, fair: 60 },
    tempMin: { kind: 'min', good: 3, fair: -3 },
    tempMax: { kind: 'max', good: 27, fair: 33 },
  },
  laundry: {
    rain: { kind: 'max', good: 0.2, fair: 0.8 },
    humidity: { kind: 'max', good: 70, fair: 85 },
    tempMax: { kind: 'min', good: 12, fair: 7 },
    wind: { kind: 'min', good: 5, fair: 2 },
  },
  gardening: {
    rain: { kind: 'max', good: 1, fair: 4 },
    gust: { kind: 'max', good: 40, fair: 55 },
    tempMin: { kind: 'min', good: 3, fair: 0 },
  },
} as const satisfies Record<IndexId, Partial<Record<CriterionKey, Threshold>>>;

export const INDEX_ORDER: readonly IndexId[] = ['cycling', 'hiking', 'laundry', 'gardening'];

/** Heures de jour minimales pour juger une journee. */
export const INDEX_MIN_HOURS = 2;

export interface IndexCriterion {
  readonly key: CriterionKey;
  /** Valeur lue sur les heures jugees ; null si une heure manque. */
  readonly value: number | null;
  readonly kind: 'max' | 'min';
  readonly good: number;
  readonly fair: number;
  readonly status: Status | 'unknown';
}

export interface PracticalIndex {
  readonly id: IndexId;
  readonly verdict: Status | 'unknown';
  readonly criteria: readonly IndexCriterion[];
}

export interface PracticalIndices {
  /** Jour juge : les heures de jour qui restent aujourd'hui, ou celles de demain. */
  readonly day: 'today' | 'tomorrow';
  readonly start: LocalIsoHour;
  /** Heure locale qui suit la derniere heure jugee (borne exclue). */
  readonly end: LocalIsoHour;
  readonly hours: number;
  /** Modeles qui fournissent les heures jugees, dans l'ordre. */
  readonly models: readonly ModelId[];
  readonly indices: readonly PracticalIndex[];
}

type Reader = (point: AlertPoint) => number | null;

const READERS: Readonly<Record<CriterionKey, { read: Reader; aggregate: Aggregate }>> = {
  rain: { read: (p) => p.precipitation.value, aggregate: 'sum' },
  gust: { read: (p) => p.windGust.value, aggregate: 'max' },
  tempMin: { read: (p) => p.temperature.value, aggregate: 'min' },
  tempMax: { read: (p) => p.temperature.value, aggregate: 'max' },
  humidity: { read: (p) => p.humidity.value, aggregate: 'mean' },
  wind: { read: (p) => p.windSpeed.value, aggregate: 'mean' },
};

type Aggregate = 'sum' | 'max' | 'min' | 'mean';

/** Valeur agregee sur toutes les heures, ou null des qu'une heure manque. */
function aggregate(points: readonly AlertPoint[], key: CriterionKey): number | null {
  const { read, aggregate: how } = READERS[key];
  const values: number[] = [];
  for (const point of points) {
    const value = read(point);
    if (value === null) {
      return null;
    }
    values.push(value);
  }
  switch (how) {
    case 'sum':
      return values.reduce((sum, value) => sum + value, 0);
    case 'max':
      return Math.max(...values);
    case 'min':
      return Math.min(...values);
    case 'mean':
      return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
}

function classify(value: number | null, threshold: Threshold): IndexCriterion['status'] {
  if (value === null) {
    return 'unknown';
  }
  const within = (limit: number) => (threshold.kind === 'max' ? value <= limit : value >= limit);
  if (within(threshold.good)) {
    return 'good';
  }
  return within(threshold.fair) ? 'fair' : 'poor';
}

function verdictOf(criteria: readonly IndexCriterion[]): PracticalIndex['verdict'] {
  if (criteria.some((c) => c.status === 'poor')) {
    return 'poor';
  }
  if (criteria.some((c) => c.status === 'unknown')) {
    return 'unknown';
  }
  return criteria.some((c) => c.status === 'fair') ? 'fair' : 'good';
}

/** Heure locale qui suit, changement d'heure et minuit compris. */
function nextHour(time: LocalIsoHour): LocalIsoHour {
  return localIsoFromUtc(utcMsFromLocalIso(time) + 60 * 60 * 1000);
}

/**
 * Verdicts du jour : les heures de jour qui restent aujourd'hui, ou celles de
 * demain quand il en reste moins de INDEX_MIN_HOURS ; null sans heure de jour
 * connue.
 */
export function practicalIndices(input: {
  readonly points: readonly AlertPoint[];
  readonly now: Date;
}): PracticalIndices | null {
  const nowIso = localIsoFromUtc(input.now.getTime());
  const today = nowIso.slice(0, 10);
  const currentHour = `${nowIso.slice(0, 13)}:00`;
  const daylight = input.points.filter((p) => p.time >= currentHour && p.isDay === true);
  const dates = [...new Set(daylight.map((p) => p.time.slice(0, 10)))];
  for (const date of dates) {
    const window = daylight.filter((p) => p.time.slice(0, 10) === date);
    const first = window[0];
    const last = window.at(-1);
    if (window.length < INDEX_MIN_HOURS || first === undefined || last === undefined) {
      continue;
    }
    const models = window.reduce<ModelId[]>((list, point) => {
      const used = [point.model, point.filledFrom?.precipitation].filter(
        (model): model is ModelId => model !== undefined,
      );
      return [...list, ...used.filter((model) => !list.includes(model))];
    }, []);
    return {
      day: date === today ? 'today' : 'tomorrow',
      start: first.time,
      end: nextHour(last.time),
      hours: window.length,
      models,
      indices: INDEX_ORDER.map((id) => {
        const criteria = (Object.entries(PRACTICAL_INDICES[id]) as [CriterionKey, Threshold][]).map(
          ([key, threshold]): IndexCriterion => {
            const value = aggregate(window, key);
            return { key, value, ...threshold, status: classify(value, threshold) };
          },
        );
        return { id, verdict: verdictOf(criteria), criteria };
      }),
    };
  }
  return null;
}

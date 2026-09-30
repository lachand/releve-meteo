import { MODEL_ORDER } from './models';
import type { StationModelSeries, StationRecord } from './stationCheck';
import { hoursBetween, localIsoFromUtc, utcMsFromLocalIso } from './time';
import type { LocalIsoHour, ModelId } from './types';

/*
 * Echeances courtes, de 1 a 12 h. Open-Meteo ne restitue pas les previsions
 * plus fines que le jour (Previous Runs) : l'application enregistre donc ses
 * propres instantanes, un par heure ou elle lit la station, avec les 12
 * heures a venir de chaque modele au point de la station. Une fois la mesure
 * publiee, chaque heure mesuree est appariee a ce que chaque modele en disait
 * 1, 2 a 3, 4 a 6 puis 7 a 12 heures plus tot. L'echeance est comptee depuis
 * l'heure de relevee de l'application, pas depuis l'initialisation du modele.
 * La collecte ne couvre que les heures ou l'application a tourne : tant que
 * les paires manquent, l'ecran dit « en collecte », sans chiffre inventé.
 */

export const SHORT_LEADS = {
  /** Heures a venir retenues dans chaque instantane. */
  horizonHours: 12,
  /** Conservation des instantanes, heures. */
  retentionHours: 7 * 24,
  /** Paires minimales, par modele et par echeance, pour parler d'ecart moyen. */
  minPairs: 6,
  buckets: [
    { label: '1 h', from: 1, to: 1 },
    { label: '3 h', from: 2, to: 3 },
    { label: '6 h', from: 4, to: 6 },
    { label: '12 h', from: 7, to: 12 },
  ],
} as const;

const HOUR_MS = 60 * 60 * 1000;

export interface ForecastSnapshot {
  /** Heure locale de la relevee, arrondie a l'heure. */
  readonly issuedAt: LocalIsoHour;
  /** Les 12 heures qui suivent la relevee. */
  readonly timeline: readonly LocalIsoHour[];
  /** °C a 2 m, alignee sur `timeline` ; null quand le modele n'a rien rendu. */
  readonly temperature: Partial<Record<ModelId, readonly (number | null)[]>>;
}

/** Instantane des heures a venir d'une lecture au point de la station, ou null s'il n'y a rien. */
export function takeSnapshot(series: StationModelSeries, now: Date): ForecastSnapshot | null {
  const issuedAt = `${localIsoFromUtc(now.getTime()).slice(0, 13)}:00` as LocalIsoHour;
  const issuedMs = utcMsFromLocalIso(issuedAt);
  const indexes: number[] = [];
  for (const [index, time] of series.timeline.entries()) {
    const lead = (utcMsFromLocalIso(time) - issuedMs) / HOUR_MS;
    if (lead >= 1 && lead <= SHORT_LEADS.horizonHours) {
      indexes.push(index);
    }
  }
  const temperature: Partial<Record<ModelId, readonly (number | null)[]>> = {};
  for (const model of MODEL_ORDER) {
    const values = series.temperature[model];
    if (values === undefined) {
      continue;
    }
    const future = indexes.map((index) => values[index] ?? null);
    if (future.some((value) => value !== null)) {
      temperature[model] = future;
    }
  }
  if (Object.keys(temperature).length === 0) {
    return null;
  }
  return {
    issuedAt,
    timeline: indexes.map((index) => series.timeline[index] as LocalIsoHour),
    temperature,
  };
}

/** Ajoute des instantanes : meme heure de relevee remplacee, trop vieux oublies, tri chronologique. */
export function mergeSnapshots(
  existing: readonly ForecastSnapshot[],
  added: readonly ForecastSnapshot[],
  now: Date,
): ForecastSnapshot[] {
  const byHour = new Map<LocalIsoHour, ForecastSnapshot>();
  for (const snapshot of [...existing, ...added]) {
    byHour.set(snapshot.issuedAt, snapshot);
  }
  const oldest = now.getTime() - SHORT_LEADS.retentionHours * HOUR_MS;
  return [...byHour.values()]
    .filter((snapshot) => utcMsFromLocalIso(snapshot.issuedAt) >= oldest)
    .sort((a, b) => utcMsFromLocalIso(a.issuedAt) - utcMsFromLocalIso(b.issuedAt));
}

export interface LeadModelScore {
  readonly model: ModelId;
  readonly pairs: number;
  /** Ecart moyen (prevu moins mesure), °C. */
  readonly bias: number;
  /** Erreur absolue moyenne, °C. */
  readonly mae: number;
}

export interface LeadBucketScores {
  readonly label: string;
  readonly from: number;
  readonly to: number;
  /** Modeles assez apparies, du plus juste au moins juste. */
  readonly models: readonly LeadModelScore[];
}

export interface LeadScores {
  readonly buckets: readonly LeadBucketScores[];
  /** Instantanes disponibles. */
  readonly snapshots: number;
  readonly oldestIssuedAt: LocalIsoHour | null;
  /** Vrai des qu'au moins un modele a assez de paires dans une echeance. */
  readonly ready: boolean;
}

/** Ecarts des instantanes enregistres face aux mesures de la station, par echeance. */
export function leadScores(input: {
  readonly snapshots: readonly ForecastSnapshot[];
  readonly records: readonly StationRecord[];
  readonly now: Date;
}): LeadScores {
  const nowMs = input.now.getTime();
  const observed = new Map<LocalIsoHour, number>();
  for (const record of input.records) {
    const value = record.temperature.value;
    if (value !== null && utcMsFromLocalIso(record.time) <= nowMs) {
      observed.set(record.time, value);
    }
  }
  const indexed = input.snapshots.map((snapshot) => ({
    snapshot,
    at: new Map(snapshot.timeline.map((time, index) => [time, index])),
  }));

  const buckets = SHORT_LEADS.buckets.map((bucket): LeadBucketScores => {
    const models: LeadModelScore[] = [];
    for (const model of MODEL_ORDER) {
      const gaps: number[] = [];
      for (const [time, truth] of observed) {
        // La relevee la plus recente de l'echeance : une seule paire par heure mesuree.
        let best: { lead: number; value: number } | null = null;
        for (const { snapshot, at } of indexed) {
          const index = at.get(time);
          const value = index === undefined ? null : (snapshot.temperature[model]?.[index] ?? null);
          if (value === null) {
            continue;
          }
          const lead = hoursBetween(snapshot.issuedAt, time);
          if (lead >= bucket.from && lead <= bucket.to && (best === null || lead < best.lead)) {
            best = { lead, value };
          }
        }
        if (best !== null) {
          gaps.push(best.value - truth);
        }
      }
      if (gaps.length >= SHORT_LEADS.minPairs) {
        models.push({
          model,
          pairs: gaps.length,
          bias: gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length,
          mae: gaps.reduce((sum, gap) => sum + Math.abs(gap), 0) / gaps.length,
        });
      }
    }
    models.sort((a, b) => a.mae - b.mae);
    return { label: bucket.label, from: bucket.from, to: bucket.to, models };
  });

  return {
    buckets,
    snapshots: input.snapshots.length,
    oldestIssuedAt: input.snapshots[0]?.issuedAt ?? null,
    ready: buckets.some((bucket) => bucket.models.length > 0),
  };
}

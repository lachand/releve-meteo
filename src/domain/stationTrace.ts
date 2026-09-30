import { MODEL_ORDER } from './models';
import type { StationModelSeries, StationRecord } from './stationCheck';
import { localIsoFromUtc, utcMsFromLocalIso } from './time';
import type { LocalIsoHour, ModelId } from './types';

/*
 * Trace horaire, mesure contre modeles : la temperature mesuree par la
 * station et celle de chaque modele au meme point, heure par heure, sur les
 * dernieres heures. Elle prolonge le controle au dernier releve
 * (stationCheck.ts) : au lieu d'un instant, on voit si un modele colle,
 * s'ecarte ou revient. L'appariement se fait sur l'heure locale, jamais
 * par index ; une heure sans mesure reste un trou, jamais une valeur
 * inventee.
 */

export const DRIFT = {
  /** Fenetre de la trace, heures. */
  hours: 36,
  /** Largeur de chaque fenetre de derive (recente, puis precedente), heures. */
  windowHours: 3,
  /** Paires modele-mesure minimales pour parler d'ecart moyen. */
  minPairs: 3,
  /** Variation de l'ecart absolu, °C, au-dela de laquelle il s'agit d'une tendance. */
  trendDeltaC: 0.5,
} as const;

const HOUR_MS = 60 * 60 * 1000;

/** L'ecart s'elargit, se resserre ou reste stable d'une fenetre a l'autre. */
export type DriftTrend = 'widening' | 'narrowing' | 'steady';

export interface ModelDrift {
  readonly model: ModelId;
  /** Ecart moyen (modele moins mesure) sur les 3 dernieres heures, °C. */
  readonly recent: number | null;
  /** Meme ecart sur les 3 heures d'avant, °C. */
  readonly earlier: number | null;
  /** null tant qu'une des deux fenetres manque de paires. */
  readonly trend: DriftTrend | null;
}

export interface StationTrace {
  /** Heures locales de la fenetre, du plus ancien au dernier releve. */
  readonly timeline: readonly LocalIsoHour[];
  /** Temperature mesuree, °C ; null quand la station n'a rien publie cette heure. */
  readonly observed: readonly (number | null)[];
  /** Temperature de chaque modele au point de la station, alignee sur `timeline`. */
  readonly byModel: Partial<Record<ModelId, readonly (number | null)[]>>;
  /** Derive de chaque modele, du plus proche au plus eloigne de la mesure recente. */
  readonly drifts: readonly ModelDrift[];
}

function meanGap(
  pairs: readonly { readonly time: number; readonly gap: number }[],
  from: number,
  to: number,
): number | null {
  const inside = pairs.filter((pair) => pair.time > from && pair.time <= to);
  return inside.length >= DRIFT.minPairs
    ? inside.reduce((sum, pair) => sum + pair.gap, 0) / inside.length
    : null;
}

function trendOf(recent: number | null, earlier: number | null): DriftTrend | null {
  if (recent === null || earlier === null) {
    return null;
  }
  const change = Math.abs(recent) - Math.abs(earlier);
  if (change >= DRIFT.trendDeltaC) {
    return 'widening';
  }
  return change <= -DRIFT.trendDeltaC ? 'narrowing' : 'steady';
}

/**
 * Trace des `hours` dernieres heures jusqu'au dernier releve de
 * temperature, ou null si la station n'en a publie aucun avant `now`.
 */
export function stationTrace(input: {
  readonly records: readonly StationRecord[];
  readonly models: StationModelSeries | null;
  readonly now: Date;
  readonly hours?: number;
}): StationTrace | null {
  const hours = input.hours ?? DRIFT.hours;
  const nowMs = input.now.getTime();
  const observedAt = new Map<LocalIsoHour, number>();
  for (const record of input.records) {
    const value = record.temperature.value;
    if (value !== null && utcMsFromLocalIso(record.time) <= nowMs) {
      observedAt.set(record.time, value);
    }
  }
  const observedMs = [...observedAt.keys()].map(utcMsFromLocalIso);
  const latestMs = Math.max(-Infinity, ...observedMs);
  if (latestMs === -Infinity) {
    return null;
  }
  // La trace commence a la premiere mesure de la fenetre : pas de vide en tete.
  const startMs = Math.max(latestMs - (hours - 1) * HOUR_MS, Math.min(...observedMs));
  const count = Math.round((latestMs - startMs) / HOUR_MS) + 1;
  const hourMs = Array.from({ length: count }, (_, i) => startMs + i * HOUR_MS);
  const timeline = hourMs.map((ms) => localIsoFromUtc(ms));
  const observed = timeline.map((time) => observedAt.get(time) ?? null);

  const indexOfTime = new Map(input.models?.timeline.map((time, index) => [time, index]) ?? []);
  const byModel: Partial<Record<ModelId, readonly (number | null)[]>> = {};
  const drifts: ModelDrift[] = [];
  for (const model of MODEL_ORDER) {
    const series = input.models?.temperature[model];
    if (series === undefined) {
      continue;
    }
    const values = timeline.map((time) => {
      const index = indexOfTime.get(time);
      return index === undefined ? null : (series[index] ?? null);
    });
    byModel[model] = values;
    const pairs = values.flatMap((value, index) => {
      const measured = observed[index];
      const at = hourMs[index];
      return value === null || measured === null || measured === undefined || at === undefined
        ? []
        : [{ time: at, gap: value - measured }];
    });
    const window = DRIFT.windowHours * HOUR_MS;
    const recent = meanGap(pairs, latestMs - window, latestMs);
    const earlier = meanGap(pairs, latestMs - 2 * window, latestMs - window);
    drifts.push({ model, recent, earlier, trend: trendOf(recent, earlier) });
  }
  drifts.sort((a, b) => {
    if (a.recent === null || b.recent === null) {
      return a.recent === b.recent ? 0 : a.recent === null ? 1 : -1;
    }
    return Math.abs(a.recent) - Math.abs(b.recent);
  });
  return { timeline, observed, byModel, drifts };
}

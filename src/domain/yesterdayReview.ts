import { MODEL_ORDER } from './models';
import type { StationModelSeries, StationRecord } from './stationCheck';
import { localIsoFromUtc } from './time';
import type { LocalIsoHour, ModelId } from './types';

/*
 * Hier, prevu contre reel : pour la journee d'hier (calendrier de Paris),
 * ce que chaque modele avait prevu la veille au point de la station
 * (`previous_day1`) face a ce que la station a mesure. Ce n'est pas la
 * simulation rejouee apres coup : c'est la prevision telle qu'elle etait
 * lisible hier. L'appariement se fait sur l'heure locale ; une heure sans
 * mesure ou sans valeur du modele ne produit aucun ecart, jamais un zero.
 */

export const YESTERDAY = {
  /** Heures appariees minimales, par modele, pour parler d'ecart moyen. */
  minHours: 12,
} as const;

export interface YesterdayModel {
  readonly model: ModelId;
  /** Heures ou la mesure et la prevision existent toutes deux. */
  readonly pairs: number;
  /** Ecart moyen (prevu moins mesure), °C : positif quand le modele voyait trop chaud. */
  readonly bias: number;
  /** Erreur absolue moyenne, °C. */
  readonly mae: number;
  /** Plus bas prevu moins plus bas mesure, sur les heures appariees, °C. */
  readonly minGap: number;
  /** Plus haut prevu moins plus haut mesure, sur les heures appariees, °C. */
  readonly maxGap: number;
}

export interface YesterdayReview {
  /** Jour examine, AAAA-MM-JJ, calendrier de Paris. */
  readonly date: string;
  /** Heures d'hier avec une mesure de temperature. */
  readonly hours: number;
  readonly observedMin: number;
  readonly observedMax: number;
  /** Du plus proche au plus eloigne de la mesure ; a egalite, ordre des modeles. */
  readonly models: readonly YesterdayModel[];
}

function dayBefore(localDate: string): string {
  const year = Number(localDate.slice(0, 4));
  const month = Number(localDate.slice(5, 7));
  const day = Number(localDate.slice(8, 10));
  // Midi UTC : la veille a Paris, quelle que soit l'heure d'ete.
  return localIsoFromUtc(Date.UTC(year, month - 1, day - 1, 12)).slice(0, 10);
}

/** Bilan d'hier, ou null sans assez de mesures, sans previsions ou sans modele exploitable. */
export function yesterdayReview(input: {
  readonly records: readonly StationRecord[];
  /** Temperatures prevues la veille au point de la station ; null si indisponibles. */
  readonly forecasts: StationModelSeries | null;
  readonly now: Date;
}): YesterdayReview | null {
  if (input.forecasts === null) {
    return null;
  }
  const date = dayBefore(localIsoFromUtc(input.now.getTime()).slice(0, 10));
  const observed = new Map<LocalIsoHour, number>();
  for (const record of input.records) {
    const value = record.temperature.value;
    if (value !== null && record.time.startsWith(date)) {
      observed.set(record.time, value);
    }
  }
  if (observed.size < YESTERDAY.minHours) {
    return null;
  }

  const { timeline, temperature } = input.forecasts;
  const models: YesterdayModel[] = [];
  for (const model of MODEL_ORDER) {
    const series = temperature[model];
    if (series === undefined) {
      continue;
    }
    const predicted: number[] = [];
    const measured: number[] = [];
    const gaps: number[] = [];
    for (const [index, time] of timeline.entries()) {
      const truth = observed.get(time);
      const value = series[index] ?? null;
      if (truth !== undefined && value !== null) {
        predicted.push(value);
        measured.push(truth);
        gaps.push(value - truth);
      }
    }
    if (predicted.length < YESTERDAY.minHours) {
      continue;
    }
    models.push({
      model,
      pairs: gaps.length,
      bias: gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length,
      mae: gaps.reduce((sum, gap) => sum + Math.abs(gap), 0) / gaps.length,
      minGap: Math.min(...predicted) - Math.min(...measured),
      maxGap: Math.max(...predicted) - Math.max(...measured),
    });
  }
  if (models.length === 0) {
    return null;
  }
  // Tri stable : MODEL_ORDER est deja l'ordre de parcours.
  models.sort((a, b) => a.mae - b.mae);
  const values = [...observed.values()];
  return {
    date,
    hours: observed.size,
    observedMin: Math.min(...values),
    observedMax: Math.max(...values),
    models,
  };
}

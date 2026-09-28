import { MODEL_ORDER } from './models';
import { utcMsFromLocalIso } from './time';
import type { ForecastBundle, LocalIsoHour, Measure, ModelId } from './types';

/*
 * Controle au dernier releve : la mesure la plus recente de la station de
 * reference (provenance 'observed'), face a ce que chaque modele donnait
 * au lieu a la meme heure.
 *
 * Les valeurs passees d'un modele sont ses sorties les plus recentes pour
 * cette heure, pas une prevision emise la veille : l'ecart dit si le
 * modele colle a la situation du moment. La verification (reliability.ts)
 * dit, elle, s'il prevoit bien a J+1, J+2... Les deux sont presentes
 * separement, jamais confondues.
 */

/** Une heure relevee par la station. Chaque valeur est une mesure, ou null. */
export interface StationRecord {
  readonly time: LocalIsoHour;
  readonly temperature: Measure;
  readonly humidity: Measure;
  readonly precipitation: Measure;
  /** km/h. */
  readonly windSpeed: Measure;
  readonly windDirection: Measure;
  /** km/h. */
  readonly windGust: Measure;
  /** Pression ramenee au niveau de la mer, hPa. */
  readonly pressure: Measure;
}

export const STATION_CHECK = {
  /** Au dela, le releve est signale comme ancien. */
  staleAfterHours: 6,
  /** Fenetre de l'ecart recent, en heures, se terminant au dernier releve. */
  recentHours: 6,
  /** Paires modele-mesure minimales pour un ecart moyen. */
  minRecentPairs: 3,
} as const;

const HOUR_MS = 60 * 60 * 1000;

export interface ModelGap {
  readonly model: ModelId;
  /** Temperature du modele au lieu, a l'heure du releve, °C. */
  readonly temperature: number | null;
  /** Modele moins mesure a l'heure du releve, °C. */
  readonly gap: number | null;
  /** Ecart moyen (modele moins mesure) sur la fenetre recente, °C. */
  readonly recentMeanGap: number | null;
  /** Heures de la fenetre ou modele et mesure existent tous deux. */
  readonly recentPairs: number;
}

export interface StationCheck {
  readonly latest: StationRecord;
  /** Minutes ecoulees depuis le dernier releve. */
  readonly ageMinutes: number;
  readonly stale: boolean;
  /**
   * Modeles presents, du plus proche au plus eloigne de la mesure : d'abord
   * ceux qui ont un ecart moyen, puis ceux qui n'ont qu'un ecart ponctuel,
   * puis ceux sans valeur. Egalite : ordre du catalogue.
   */
  readonly gaps: readonly ModelGap[];
}

function rankKey(gap: ModelGap): readonly [number, number] {
  if (gap.recentMeanGap !== null) {
    return [0, Math.abs(gap.recentMeanGap)];
  }
  if (gap.gap !== null) {
    return [1, Math.abs(gap.gap)];
  }
  return [2, 0];
}

function compareGaps(a: ModelGap, b: ModelGap): number {
  const [tierA, valueA] = rankKey(a);
  const [tierB, valueB] = rankKey(b);
  if (tierA !== tierB) {
    return tierA - tierB;
  }
  if (valueA !== valueB) {
    return valueA - valueB;
  }
  return MODEL_ORDER.indexOf(a.model) - MODEL_ORDER.indexOf(b.model);
}

/**
 * Dernier releve de temperature et ecart de chaque modele, ou null si la
 * station n'a releve aucune temperature avant `now`. L'appariement se
 * fait sur l'heure locale, jamais par index.
 */
export function stationCheck(input: {
  readonly records: readonly StationRecord[];
  readonly bundle: ForecastBundle;
  readonly now: Date;
}): StationCheck | null {
  const nowMs = input.now.getTime();
  const measured = input.records
    .filter((r) => r.temperature.value !== null && utcMsFromLocalIso(r.time) <= nowMs)
    .sort((a, b) => utcMsFromLocalIso(a.time) - utcMsFromLocalIso(b.time));
  const latest = measured.at(-1);
  if (latest === undefined) {
    return null;
  }
  const latestMs = utcMsFromLocalIso(latest.time);
  const recent = measured.filter(
    (r) => latestMs - utcMsFromLocalIso(r.time) < STATION_CHECK.recentHours * HOUR_MS,
  );
  const indexOfTime = new Map(input.bundle.timeline.map((time, index) => [time, index]));

  const gaps = MODEL_ORDER.flatMap((model): ModelGap[] => {
    const series = input.bundle.series[model];
    if (series === undefined) {
      return [];
    }
    const modelValue = (time: LocalIsoHour): number | null => {
      const index = indexOfTime.get(time);
      return index === undefined ? null : (series.hourly[index]?.temperature.value ?? null);
    };
    const differences: number[] = [];
    for (const r of recent) {
      const predicted = modelValue(r.time);
      if (predicted !== null && r.temperature.value !== null) {
        differences.push(predicted - r.temperature.value);
      }
    }
    const temperature = modelValue(latest.time);
    const observed = latest.temperature.value;
    return [
      {
        model,
        temperature,
        gap: temperature === null || observed === null ? null : temperature - observed,
        recentMeanGap:
          differences.length >= STATION_CHECK.minRecentPairs
            ? differences.reduce((sum, value) => sum + value, 0) / differences.length
            : null,
        recentPairs: differences.length,
      },
    ];
  }).sort(compareGaps);

  const ageMinutes = Math.round((nowMs - latestMs) / 60000);
  return {
    latest,
    ageMinutes,
    stale: ageMinutes > STATION_CHECK.staleAfterHours * 60,
    gaps,
  };
}

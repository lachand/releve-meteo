import { MODEL_ORDER } from './models';
import { localIsoFromUtc, utcMsFromLocalIso } from './time';
import type { LocalIsoHour, ModelId } from './types';

/*
 * Mon relevé : vos propres mesures (thermometre, pluviometre) saisies a la main,
 * comparees a ce que chaque modele avait prevu la veille pour votre lieu. C'est
 * la reponse directe a « tel modele se trompe chez moi » avec une reference
 * qui est vraiment chez vous. Provenance : vos mesures sont « observed »,
 * saisies par vous ; les modeles sont « forecast », prevus la veille. Un champ
 * non saisi reste vide, jamais un zero.
 */

export const OWN_READINGS = {
  /** Saisies gardees, tous lieux confondus, au plus. */
  maxKept: 800,
  /** Une saisie n'est comparee que si elle a moins de ce nombre de jours (fenetre de la prevision de la veille). */
  windowDays: 30,
  /** Heures valides minimales pour qu'une journee prevue compte. */
  minHoursPerDay: 20,
  /** Bornes de saisie, °C et mm. */
  temperature: { min: -60, max: 60 },
  rainMax: 500,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ce que vous avez mesure un jour a un endroit ; chaque champ est facultatif. */
export interface OwnReading {
  readonly placeId: string;
  readonly date: string; // 'YYYY-MM-DD'
  readonly tempMax: number | null;
  readonly tempMin: number | null;
  /** Cumul du pluviometre, mm. */
  readonly rain: number | null;
}

export type ReadingProblem = 'empty' | 'range' | 'order' | 'date';

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

/** Pourquoi une saisie est refusee, ou null quand elle est recevable. */
export function readingProblem(
  input: {
    readonly date: string;
    readonly tempMax: number | null;
    readonly tempMin: number | null;
    readonly rain: number | null;
  },
  today: string,
): ReadingProblem | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > today) {
    return 'date';
  }
  if (input.tempMax === null && input.tempMin === null && input.rain === null) {
    return 'empty';
  }
  const { min, max } = OWN_READINGS.temperature;
  const temperatures = [input.tempMax, input.tempMin].filter((t): t is number => t !== null);
  if (
    temperatures.some((t) => t < min || t > max) ||
    (input.rain !== null && (input.rain < 0 || input.rain > OWN_READINGS.rainMax))
  ) {
    return 'range';
  }
  if (input.tempMax !== null && input.tempMin !== null && input.tempMax < input.tempMin) {
    return 'order';
  }
  return null;
}

export function isOwnReading(value: unknown): value is OwnReading {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const reading = value as Record<string, unknown>;
  return (
    typeof reading.placeId === 'string' &&
    typeof reading.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(reading.date) &&
    isNullableNumber(reading.tempMax) &&
    isNullableNumber(reading.tempMin) &&
    isNullableNumber(reading.rain) &&
    // Un enregistrement doit porter les trois champs (null compris) : `undefined` est abime.
    'tempMax' in reading &&
    'tempMin' in reading &&
    'rain' in reading
  );
}

/** Ajoute la saisie (celle du meme lieu et du meme jour est remplacee), la plus recente en tete. */
export function upsertReading(
  list: readonly OwnReading[],
  reading: OwnReading,
): readonly OwnReading[] {
  const kept = list.filter((r) => !(r.placeId === reading.placeId && r.date === reading.date));
  return (
    [reading, ...kept]
      // Tri stable : a date egale, la saisie qui vient d'etre faite reste en tete.
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, OWN_READINGS.maxKept)
  );
}

export function removeReading(
  list: readonly OwnReading[],
  placeId: string,
  date: string,
): readonly OwnReading[] {
  return list.filter((r) => !(r.placeId === placeId && r.date === date));
}

export function readingsOf(list: readonly OwnReading[], placeId: string): readonly OwnReading[] {
  return list.filter((r) => r.placeId === placeId);
}

/** Temperature et pluie horaires prevues la veille, par modele, sur une meme heure locale. */
export interface PreviousDaySeries {
  readonly timeline: readonly LocalIsoHour[];
  readonly temperature: Partial<Record<ModelId, readonly (number | null)[]>>;
  readonly precipitation: Partial<Record<ModelId, readonly (number | null)[]>>;
}

/** Ce qu'un modele annoncait la veille pour une journee entiere. */
export interface DayPrediction {
  readonly tempMax: number | null;
  readonly tempMin: number | null;
  readonly rain: number | null;
}

function dayValues(
  timeline: readonly LocalIsoHour[],
  values: readonly (number | null)[] | undefined,
  date: string,
): number[] {
  const found: number[] = [];
  for (const [index, time] of timeline.entries()) {
    const value = values?.[index];
    if (time.startsWith(date) && value !== undefined && value !== null) {
      found.push(value);
    }
  }
  return found;
}

/**
 * Maximum, minimum et cumul de pluie prevus la veille pour la journee, ou null
 * quand le modele n'a rien rendu ou que la journee n'est pas dans la serie. Une
 * journee a trop d'heures manquantes laisse le champ vide, jamais complete par
 * des zeros.
 */
export function predictionFor(
  series: PreviousDaySeries,
  model: ModelId,
  date: string,
): DayPrediction | null {
  const temperature = series.temperature[model];
  const precipitation = series.precipitation[model];
  if (temperature === undefined && precipitation === undefined) {
    return null;
  }
  if (!series.timeline.some((time) => time.startsWith(date))) {
    return null;
  }
  const temps = dayValues(series.timeline, temperature, date);
  const rains = dayValues(series.timeline, precipitation, date);
  const hasTemps = temps.length >= OWN_READINGS.minHoursPerDay;
  const hasRain = rains.length >= OWN_READINGS.minHoursPerDay;
  return {
    tempMax: hasTemps ? Math.max(...temps) : null,
    tempMin: hasTemps ? Math.min(...temps) : null,
    rain: hasRain ? Math.round(rains.reduce((sum, v) => sum + v, 0) * 10) / 10 : null,
  };
}

export interface FieldStats {
  /** Valeurs comparees (une par champ saisi et par jour). */
  readonly values: number;
  /** Ecart absolu moyen, dans l'unite du champ. */
  readonly mae: number;
  /** Prevu moins votre mesure, en moyenne. */
  readonly bias: number;
}

export interface ModelComparison {
  readonly model: ModelId;
  /** Maxima et minima ensemble, °C ; null sans temperature saisie ni prevue. */
  readonly temperature: FieldStats | null;
  /** Cumul de pluie du jour, mm ; null sans pluie saisie ni prevue. */
  readonly rain: FieldStats | null;
}

export interface DayComparison {
  readonly date: string;
  readonly reading: OwnReading;
  /** Dans l'ordre du classement des modeles. */
  readonly models: readonly { readonly model: ModelId; readonly prediction: DayPrediction }[];
}

export interface ReadingsComparison {
  readonly days: readonly DayComparison[];
  /** Du plus proche au plus eloigne de votre thermometre. */
  readonly models: readonly ModelComparison[];
  /** Saisies comparees, et saisies laissees de cote (jour en cours, trop ancienne, sans prevision). */
  readonly compared: number;
  readonly skipped: number;
}

function stats(errors: readonly number[]): FieldStats | null {
  if (errors.length === 0) {
    return null;
  }
  return {
    values: errors.length,
    mae: errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length,
    bias: errors.reduce((sum, e) => sum + e, 0) / errors.length,
  };
}

/**
 * Vos saisies face a ce que chaque modele avait prevu la veille. Seuls les
 * jours finis, dans la fenetre de la prevision de la veille, sont compares ;
 * chaque champ saisi est compare a son pendant, un champ vide n'est jamais un zero.
 */
export function compareReadings(input: {
  readonly readings: readonly OwnReading[];
  readonly series: PreviousDaySeries;
  readonly today: string;
}): ReadingsComparison {
  const oldest = localIsoFromUtc(
    utcMsFromLocalIso(`${input.today}T12:00`) - OWN_READINGS.windowDays * DAY_MS,
  ).slice(0, 10);
  const models = MODEL_ORDER.filter(
    (model) =>
      input.series.temperature[model] !== undefined ||
      input.series.precipitation[model] !== undefined,
  );
  const days: { date: string; reading: OwnReading; predictions: Map<ModelId, DayPrediction> }[] =
    [];
  let skipped = 0;
  for (const reading of input.readings) {
    const predictions = new Map<ModelId, DayPrediction>();
    if (reading.date < input.today && reading.date >= oldest) {
      for (const model of models) {
        const prediction = predictionFor(input.series, model, reading.date);
        if (prediction !== null) {
          predictions.set(model, prediction);
        }
      }
    }
    if (predictions.size === 0) {
      skipped += 1;
    } else {
      days.push({ date: reading.date, reading, predictions });
    }
  }
  // Ecarts prevu moins mesure, par modele : une valeur par champ saisi et par jour compare.
  const errors = new Map<ModelId, { temperature: number[]; rain: number[] }>();
  for (const day of days) {
    for (const [model, prediction] of day.predictions) {
      const own = errors.get(model) ?? { temperature: [], rain: [] };
      if (day.reading.tempMax !== null && prediction.tempMax !== null) {
        own.temperature.push(prediction.tempMax - day.reading.tempMax);
      }
      if (day.reading.tempMin !== null && prediction.tempMin !== null) {
        own.temperature.push(prediction.tempMin - day.reading.tempMin);
      }
      if (day.reading.rain !== null && prediction.rain !== null) {
        own.rain.push(prediction.rain - day.reading.rain);
      }
      errors.set(model, own);
    }
  }
  const comparisons: ModelComparison[] = [...errors.entries()].flatMap(
    ([model, own]): ModelComparison[] => {
      const result = { model, temperature: stats(own.temperature), rain: stats(own.rain) };
      return result.temperature === null && result.rain === null ? [] : [result];
    },
  );
  const order = (c: ModelComparison) => c.temperature?.mae ?? Number.POSITIVE_INFINITY;
  const ranked = [...comparisons].sort(
    (a, b) => order(a) - order(b) || MODEL_ORDER.indexOf(a.model) - MODEL_ORDER.indexOf(b.model),
  );
  // Ordre des jours : les modeles classes d'abord, puis ceux sans ecart comparable (dans l'ordre habituel).
  const ranking = [
    ...ranked.map((c) => c.model),
    ...models.filter((model) => !ranked.some((c) => c.model === model)),
  ];
  return {
    days: days.map((day) => ({
      date: day.date,
      reading: day.reading,
      models: [...day.predictions.entries()]
        .map(([model, prediction]) => ({ model, prediction }))
        .sort((a, b) => ranking.indexOf(a.model) - ranking.indexOf(b.model)),
    })),
    models: ranked,
    compared: days.length,
    skipped,
  };
}

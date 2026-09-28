import type {
  DailyPoint,
  ForecastBundle,
  HourlyPoint,
  LocalIsoHour,
  Measure,
  ModelId,
  Place,
  Provenance,
} from '../src/domain/types';

/*
 * Fabriques partagees pour les tests : un seul endroit a mettre a jour
 * quand HourlyPoint ou DailyPoint gagnent un champ.
 */

type HourlyMeasureField = keyof Omit<HourlyPoint, 'time' | 'weatherCode' | 'isDay'>;
type DailyMeasureField = keyof Omit<DailyPoint, 'date' | 'sunrise' | 'sunset' | 'weatherCode'>;

export type HourlyValues = Partial<Record<HourlyMeasureField, number | null>> & {
  readonly weatherCode?: number | null;
  readonly isDay?: boolean | null;
  readonly provenance?: Provenance;
};

export type DailyValues = Partial<Record<DailyMeasureField, number | null>> & {
  readonly sunrise?: string | null;
  readonly sunset?: string | null;
  readonly weatherCode?: number | null;
  readonly provenance?: Provenance;
};

const HOURLY_DEFAULTS: Readonly<Record<HourlyMeasureField, number | null>> = {
  temperature: 14,
  precipitation: 0,
  windSpeed: 10,
  windGust: 20,
  windDirection: 180,
  pressure: 1013,
  dewPoint: 8,
  cloudCover: 50,
  radiation: 200,
  humidity: 65,
  apparentTemperature: 13,
  precipitationProbability: null,
  snowfall: 0,
  cape: 0,
  visibility: 20000,
  freezingLevel: 3000,
};

const DAILY_DEFAULTS: Readonly<Record<DailyMeasureField, number | null>> = {
  tempMax: 22,
  tempMin: 12,
  precipitationSum: 0,
  uvIndexMax: 5,
  windGustMax: 30,
  windSpeedMax: 15,
  windDirectionDominant: 220,
  precipitationHours: 0,
  snowfallSum: 0,
};

export function measure(value: number | null, provenance: Provenance = 'forecast'): Measure {
  return { value, provenance };
}

export function hourlyPoint(time: LocalIsoHour, values: HourlyValues = {}): HourlyPoint {
  const provenance = values.provenance ?? 'forecast';
  const m = (field: HourlyMeasureField): Measure =>
    measure(field in values ? (values[field] ?? null) : HOURLY_DEFAULTS[field], provenance);
  return {
    time,
    temperature: m('temperature'),
    precipitation: m('precipitation'),
    windSpeed: m('windSpeed'),
    windGust: m('windGust'),
    windDirection: m('windDirection'),
    pressure: m('pressure'),
    dewPoint: m('dewPoint'),
    cloudCover: m('cloudCover'),
    radiation: m('radiation'),
    humidity: m('humidity'),
    apparentTemperature: m('apparentTemperature'),
    precipitationProbability: m('precipitationProbability'),
    snowfall: m('snowfall'),
    cape: m('cape'),
    visibility: m('visibility'),
    freezingLevel: m('freezingLevel'),
    weatherCode: 'weatherCode' in values ? (values.weatherCode ?? null) : 1,
    isDay: 'isDay' in values ? (values.isDay ?? null) : true,
  };
}

export function dailyPoint(date: string, values: DailyValues = {}): DailyPoint {
  const provenance = values.provenance ?? 'forecast';
  const m = (field: DailyMeasureField): Measure =>
    measure(field in values ? (values[field] ?? null) : DAILY_DEFAULTS[field], provenance);
  return {
    date,
    tempMax: m('tempMax'),
    tempMin: m('tempMin'),
    precipitationSum: m('precipitationSum'),
    uvIndexMax: m('uvIndexMax'),
    windGustMax: m('windGustMax'),
    windSpeedMax: m('windSpeedMax'),
    windDirectionDominant: m('windDirectionDominant'),
    precipitationHours: m('precipitationHours'),
    snowfallSum: m('snowfallSum'),
    sunrise: 'sunrise' in values ? (values.sunrise ?? null) : `${date}T07:30`,
    sunset: 'sunset' in values ? (values.sunset ?? null) : `${date}T20:00`,
    weatherCode: 'weatherCode' in values ? (values.weatherCode ?? null) : 1,
  };
}

/** Timeline horaire locale sans changement d'heure (calcul UTC naif). */
export function buildHourlyTimeline(startIso: LocalIsoHour, count: number): LocalIsoHour[] {
  const timeline: LocalIsoHour[] = [];
  const [datePart, timePart] = startIso.split('T');
  const [y, m, d] = (datePart ?? '').split('-').map(Number);
  const [h] = (timePart ?? '').split(':').map(Number);
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, (h ?? 0) + i));
    timeline.push(
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}:00`,
    );
  }
  return timeline;
}

export const TEST_PLACE: Place = {
  id: '45.4936:5.4708',
  name: 'Val de Virieu',
  latitude: 45.4936,
  longitude: 5.4708,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

/**
 * Bundle ou chaque modele reprend les memes valeurs, eventuellement
 * surchargees par une fonction (modele, index) -> valeurs.
 */
export function buildBundle(input: {
  readonly timeline: readonly LocalIsoHour[];
  readonly models: readonly ModelId[];
  readonly values?: (model: ModelId, index: number) => HourlyValues;
  readonly daily?: readonly DailyPoint[];
  readonly place?: Place;
  readonly fetchedAt?: number;
}): ForecastBundle {
  const series: Partial<
    Record<ModelId, { model: ModelId; hourly: HourlyPoint[]; daily: readonly DailyPoint[] }>
  > = {};
  for (const model of input.models) {
    series[model] = {
      model,
      hourly: input.timeline.map((time, index) => hourlyPoint(time, input.values?.(model, index))),
      daily: input.daily ?? [],
    };
  }
  return {
    place: input.place ?? TEST_PLACE,
    fetchedAt: input.fetchedAt ?? 0,
    timeline: input.timeline,
    series,
  };
}

import { leadHoursFrom } from '../../domain/time';
import type {
  DailyPoint,
  ForecastBundle,
  HourlyPoint,
  LocalIsoHour,
  Measure,
  ModelId,
  ModelSeries,
  Place,
  Provenance,
} from '../../domain/types';
import type { HttpResult } from '../clients/http';
import { OPEN_METEO_MODEL_IDS } from '../clients/openMeteo';
import type { RawForecastResponse } from '../clients/openMeteo';

export interface MapOpenMeteoInput {
  readonly place: Place;
  readonly requestedModels: readonly ModelId[];
  readonly response: RawForecastResponse;
  readonly now: Date;
  readonly fetchedAt: number;
}

export interface MappedForecast {
  readonly bundle: ForecastBundle;
  readonly missingModels: readonly ModelId[];
}

type RawBlock = Readonly<Record<string, readonly (number | null)[] | readonly string[]>>;

const HOURLY_MEASURES: readonly [keyof Omit<HourlyPoint, 'time' | 'weatherCode'>, string][] = [
  ['temperature', 'temperature_2m'],
  ['precipitation', 'precipitation'],
  ['windSpeed', 'wind_speed_10m'],
  ['windGust', 'wind_gusts_10m'],
  ['windDirection', 'wind_direction_10m'],
  ['pressure', 'pressure_msl'],
  ['dewPoint', 'dew_point_2m'],
  ['cloudCover', 'cloud_cover'],
  ['radiation', 'shortwave_radiation'],
];

const DAILY_MEASURES: readonly [
  keyof Omit<DailyPoint, 'date' | 'sunrise' | 'sunset' | 'weatherCode'>,
  string,
][] = [
  ['tempMax', 'temperature_2m_max'],
  ['tempMin', 'temperature_2m_min'],
  ['precipitationSum', 'precipitation_sum'],
  ['uvIndexMax', 'uv_index_max'],
];

function variableKey(variable: string, model: ModelId, suffixed: boolean): string {
  return suffixed ? `${variable}_${OPEN_METEO_MODEL_IDS[model]}` : variable;
}

/**
 * Extrait une serie numerique pour une cle donnee.
 * - Cle absente : la variable n'a pas ete renvoyee pour ce modele, tableau
 *   de null de la longueur attendue (pas une erreur).
 * - Cle presente mais de longueur differente : signale par null, le
 *   mapper entier echoue alors en malformed plutot que de construire un
 *   bundle partiel silencieux.
 */
function readNumericSeries(
  block: RawBlock,
  key: string,
  expectedLength: number,
): readonly (number | null)[] | null {
  const raw = block[key];
  if (raw === undefined) {
    return new Array<null>(expectedLength).fill(null);
  }
  if (raw.length !== expectedLength) {
    return null;
  }
  return raw as readonly (number | null)[];
}

function readStringSeries(
  block: RawBlock,
  key: string,
  expectedLength: number,
): readonly (string | null)[] | null {
  const raw = block[key];
  if (raw === undefined) {
    return new Array<null>(expectedLength).fill(null);
  }
  if (raw.length !== expectedLength) {
    return null;
  }
  return raw as readonly (string | null)[];
}

function provenanceAt(now: Date, time: LocalIsoHour): Provenance {
  return leadHoursFrom(now, time) < 0 ? 'estimated' : 'forecast';
}

function isModelPresent(hourly: RawBlock, model: ModelId, suffixed: boolean): boolean {
  return HOURLY_MEASURES.some(([, variable]) => variableKey(variable, model, suffixed) in hourly);
}

function mapHourlySeries(
  hourly: RawBlock,
  timeline: readonly LocalIsoHour[],
  model: ModelId,
  suffixed: boolean,
  now: Date,
): readonly HourlyPoint[] | null {
  const seriesByField = new Map<string, readonly (number | null)[]>();
  for (const [field, variable] of HOURLY_MEASURES) {
    const values = readNumericSeries(
      hourly,
      variableKey(variable, model, suffixed),
      timeline.length,
    );
    if (values === null) {
      return null;
    }
    seriesByField.set(field, values);
  }
  const weatherCode = readNumericSeries(
    hourly,
    variableKey('weather_code', model, suffixed),
    timeline.length,
  );
  if (weatherCode === null) {
    return null;
  }

  return timeline.map((time, index) => {
    const measure = (field: string): Measure => ({
      value: seriesByField.get(field)?.[index] ?? null,
      provenance: provenanceAt(now, time),
    });
    return {
      time,
      temperature: measure('temperature'),
      precipitation: measure('precipitation'),
      windSpeed: measure('windSpeed'),
      windGust: measure('windGust'),
      windDirection: measure('windDirection'),
      pressure: measure('pressure'),
      dewPoint: measure('dewPoint'),
      cloudCover: measure('cloudCover'),
      radiation: measure('radiation'),
      weatherCode: weatherCode[index] ?? null,
    };
  });
}

function mapDailySeries(
  daily: RawBlock | undefined,
  model: ModelId,
  suffixed: boolean,
  now: Date,
): readonly DailyPoint[] | null {
  const dateSeries = daily?.time;
  if (daily === undefined || dateSeries === undefined) {
    return [];
  }
  const length = dateSeries.length;

  const seriesByField = new Map<string, readonly (number | null)[]>();
  for (const [field, variable] of DAILY_MEASURES) {
    const values = readNumericSeries(daily, variableKey(variable, model, suffixed), length);
    if (values === null) {
      return null;
    }
    seriesByField.set(field, values);
  }
  const weatherCode = readNumericSeries(
    daily,
    variableKey('weather_code', model, suffixed),
    length,
  );
  const sunrise = readStringSeries(daily, variableKey('sunrise', model, suffixed), length);
  const sunset = readStringSeries(daily, variableKey('sunset', model, suffixed), length);
  if (weatherCode === null || sunrise === null || sunset === null) {
    return null;
  }

  return (dateSeries as readonly string[]).map((date, index) => {
    const measure = (field: string): Measure => ({
      value: seriesByField.get(field)?.[index] ?? null,
      // Les journees passees d'un cumul quotidien restent 'estimated', comme
      // pour l'horaire : provenanceAt compare la date a now.
      provenance: provenanceAt(now, `${date}T12:00`),
    });
    return {
      date,
      tempMax: measure('tempMax'),
      tempMin: measure('tempMin'),
      precipitationSum: measure('precipitationSum'),
      uvIndexMax: measure('uvIndexMax'),
      sunrise: sunrise[index] ?? null,
      sunset: sunset[index] ?? null,
      weatherCode: weatherCode[index] ?? null,
    };
  });
}

/**
 * Convertit une reponse brute Open-Meteo en ForecastBundle. Ne leve jamais
 * d'exception : un payload structurellement invalide produit un
 * HttpResult d'echec malformed plutot qu'un bundle partiel.
 */
export function mapOpenMeteoResponse(input: MapOpenMeteoInput): HttpResult<MappedForecast> {
  const { place, requestedModels, response, now, fetchedAt } = input;
  const hourly = response.hourly;
  const timeline = hourly?.time;
  if (hourly === undefined || timeline === undefined) {
    return { ok: false, failure: { kind: 'malformed', detail: "payload sans bloc 'hourly'" } };
  }

  const suffixed = requestedModels.length > 1;
  const series: Partial<Record<ModelId, ModelSeries>> = {};
  const missingModels: ModelId[] = [];

  for (const model of requestedModels) {
    if (!isModelPresent(hourly, model, suffixed)) {
      missingModels.push(model);
      continue;
    }
    const hourlySeries = mapHourlySeries(
      hourly,
      timeline as readonly LocalIsoHour[],
      model,
      suffixed,
      now,
    );
    if (hourlySeries === null) {
      return {
        ok: false,
        failure: { kind: 'malformed', detail: `longueurs incoherentes pour le modele ${model}` },
      };
    }
    const dailySeries = mapDailySeries(response.daily, model, suffixed, now);
    if (dailySeries === null) {
      return {
        ok: false,
        failure: {
          kind: 'malformed',
          detail: `longueurs incoherentes (quotidien) pour le modele ${model}`,
        },
      };
    }
    series[model] = { model, hourly: hourlySeries, daily: dailySeries };
  }

  return {
    ok: true,
    value: {
      bundle: { place, fetchedAt, timeline: timeline as readonly LocalIsoHour[], series },
      missingModels,
    },
  };
}

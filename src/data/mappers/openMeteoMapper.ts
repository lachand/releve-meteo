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

type HourlyMeasureField = keyof Omit<HourlyPoint, 'time' | 'weatherCode' | 'isDay'>;

const HOURLY_MEASURES: readonly [HourlyMeasureField, string][] = [
  ['temperature', 'temperature_2m'],
  ['precipitation', 'precipitation'],
  ['windSpeed', 'wind_speed_10m'],
  ['windGust', 'wind_gusts_10m'],
  ['windDirection', 'wind_direction_10m'],
  ['pressure', 'pressure_msl'],
  ['dewPoint', 'dew_point_2m'],
  ['cloudCover', 'cloud_cover'],
  ['radiation', 'shortwave_radiation'],
  ['humidity', 'relative_humidity_2m'],
  ['apparentTemperature', 'apparent_temperature'],
  ['precipitationProbability', 'precipitation_probability'],
  ['snowfall', 'snowfall'],
  ['cape', 'cape'],
  ['visibility', 'visibility'],
  ['freezingLevel', 'freezing_level_height'],
];

// Variables dont la seule presence dans le payload prouve que le modele a
// repondu. Les variables optionnelles (probabilite, cape...) sont souvent
// renvoyees en null pour un modele qui ne les fournit pas : elles ne
// comptent pas pour detecter un modele absent.
const PRESENCE_VARIABLES: readonly string[] = ['temperature_2m', 'precipitation', 'wind_speed_10m'];

type DailyMeasureField = keyof Omit<DailyPoint, 'date' | 'sunrise' | 'sunset' | 'weatherCode'>;

const DAILY_MEASURES: readonly [DailyMeasureField, string][] = [
  ['tempMax', 'temperature_2m_max'],
  ['tempMin', 'temperature_2m_min'],
  ['precipitationSum', 'precipitation_sum'],
  ['uvIndexMax', 'uv_index_max'],
  ['windGustMax', 'wind_gusts_10m_max'],
  ['windSpeedMax', 'wind_speed_10m_max'],
  ['windDirectionDominant', 'wind_direction_10m_dominant'],
  ['precipitationHours', 'precipitation_hours'],
  ['snowfallSum', 'snowfall_sum'],
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

/**
 * Un modele est present si l'une des variables de base est dans le payload
 * avec au moins une valeur non nulle. Open-Meteo renvoie parfois les cles
 * d'un modele hors domaine (ICON-D2 sur la Bretagne) remplies de null :
 * ce modele est alors traite comme absent plutot que comme une serie vide.
 */
function isModelPresent(hourly: RawBlock, model: ModelId, suffixed: boolean): boolean {
  return PRESENCE_VARIABLES.some((variable) => {
    const raw = hourly[variableKey(variable, model, suffixed)];
    return (
      raw !== undefined && (raw as readonly (number | string | null)[]).some((v) => v !== null)
    );
  });
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
  const isDay = readNumericSeries(hourly, variableKey('is_day', model, suffixed), timeline.length);
  if (weatherCode === null || isDay === null) {
    return null;
  }

  return timeline.map((time, index) => {
    const measure = (field: string): Measure => ({
      value: seriesByField.get(field)?.[index] ?? null,
      provenance: provenanceAt(now, time),
    });
    const day = isDay[index] ?? null;
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
      humidity: measure('humidity'),
      apparentTemperature: measure('apparentTemperature'),
      precipitationProbability: measure('precipitationProbability'),
      snowfall: measure('snowfall'),
      cape: measure('cape'),
      visibility: measure('visibility'),
      freezingLevel: measure('freezingLevel'),
      weatherCode: weatherCode[index] ?? null,
      isDay: day === null ? null : day === 1,
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
      windGustMax: measure('windGustMax'),
      windSpeedMax: measure('windSpeedMax'),
      windDirectionDominant: measure('windDirectionDominant'),
      precipitationHours: measure('precipitationHours'),
      snowfallSum: measure('snowfallSum'),
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

  // Altitude inconnue (0 : position GPS sans altitude, lien partage ancien) :
  // celle du modele numerique de terrain d'Open-Meteo la remplace. Elle sert
  // au classement du terrain et au choix de la station de reference.
  const elevation =
    place.elevation === 0 && Number.isFinite(response.elevation)
      ? response.elevation
      : place.elevation;
  return {
    ok: true,
    value: {
      bundle: {
        place: elevation === place.elevation ? place : { ...place, elevation },
        fetchedAt,
        timeline: timeline as readonly LocalIsoHour[],
        series,
      },
      missingModels,
    },
  };
}

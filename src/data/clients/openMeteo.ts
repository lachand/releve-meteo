import type { StationModelSeries } from '../../domain/stationCheck';
import type { LocalIsoHour, ModelId } from '../../domain/types';
import { request } from './http';
import type { HttpResult } from './http';

export interface ForecastQuery {
  readonly latitude: number;
  readonly longitude: number;
  readonly models: readonly ModelId[];
  readonly pastDays?: number; // 0 a 92, defaut 0
  readonly forecastDays?: number; // defaut 7
}

export interface RawForecastResponse {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number;
  readonly timezone: string;
  readonly utc_offset_seconds: number;
  readonly hourly?: Readonly<Record<string, readonly (number | null)[] | readonly string[]>>;
  readonly hourly_units?: Readonly<Record<string, string>>;
  readonly daily?: Readonly<Record<string, readonly (number | null)[] | readonly string[]>>;
  readonly daily_units?: Readonly<Record<string, string>>;
  readonly minutely_15?: Readonly<Record<string, readonly (number | null)[] | readonly string[]>>;
}

// ARCHITECTURE.md section 4.1. Identifiants verifies contre la
// documentation Open-Meteo (meteofrance-api, dwd-api, ecmwf-api, gfs-api).
export const OPEN_METEO_MODEL_IDS: Readonly<Record<ModelId, string>> = {
  arome: 'meteofrance_arome_france_hd',
  arome_france: 'meteofrance_arome_france',
  icon_d2: 'icon_d2',
  arpege: 'meteofrance_arpege_europe',
  icon_eu: 'icon_eu',
  ecmwf: 'ecmwf_ifs025',
  gfs: 'gfs_seamless',
} as const;

export const HOURLY_VARIABLES = [
  'temperature_2m',
  'precipitation',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'pressure_msl',
  'dew_point_2m',
  'cloud_cover',
  'shortwave_radiation',
  'relative_humidity_2m',
  'apparent_temperature',
  'precipitation_probability',
  'snowfall',
  'cape',
  'visibility',
  'freezing_level_height',
  'is_day',
  'weather_code',
] as const;

export const DAILY_VARIABLES = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'uv_index_max',
  'wind_gusts_10m_max',
  'wind_speed_10m_max',
  'wind_direction_10m_dominant',
  'precipitation_hours',
  'snowfall_sum',
  'sunrise',
  'sunset',
  'weather_code',
] as const;

export function buildForecastUrl(query: ForecastQuery): string {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(query.latitude));
  url.searchParams.set('longitude', String(query.longitude));
  url.searchParams.set(
    'models',
    query.models.map((model) => OPEN_METEO_MODEL_IDS[model]).join(','),
  );
  url.searchParams.set('hourly', HOURLY_VARIABLES.join(','));
  url.searchParams.set('daily', DAILY_VARIABLES.join(','));
  url.searchParams.set('timezone', 'Europe/Paris');
  url.searchParams.set('past_days', String(query.pastDays ?? 0));
  url.searchParams.set('forecast_days', String(query.forecastDays ?? 7));
  return url.toString();
}

// ARCHITECTURE.md section 4.2 documente ce retour comme un
// Promise<RawForecastResponse> non enveloppe, incoherent avec le principe
// section 4.3 ("aucune exception n'est levee pour un echec reseau") que
// respecte tout le reste de la couche donnees, y compris le repository.
// Ecart consigne dans BACKLOG.md : enveloppe dans HttpResult par prudence.
export async function fetchForecast(
  query: ForecastQuery,
  signal?: AbortSignal,
): Promise<HttpResult<RawForecastResponse>> {
  return request<RawForecastResponse>(buildForecastUrl(query), { signal });
}

/**
 * Nowcast : precipitation au pas de 15 min sur les 2 prochaines heures,
 * AROME 1,3 km uniquement (seul modele a fournir ce pas nativement chez
 * Open-Meteo, les autres sont interpoles).
 */
export function buildNowcastUrl(latitude: number, longitude: number): string {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('models', OPEN_METEO_MODEL_IDS.arome);
  url.searchParams.set('minutely_15', 'precipitation');
  url.searchParams.set('forecast_minutely_15', '12');
  url.searchParams.set('past_minutely_15', '4');
  url.searchParams.set('timezone', 'Europe/Paris');
  return url.toString();
}

export async function fetchNowcast(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<HttpResult<RawForecastResponse>> {
  return request<RawForecastResponse>(buildNowcastUrl(latitude, longitude), { signal });
}

/**
 * Heures passees demandees au point de la station : de quoi couvrir les
 * releves recents (repository.STATION_REPORT_HOURS).
 */
export const STATION_POINT_PAST_HOURS = 36;

/**
 * Temperature de chaque modele au point exact d'une station, a son
 * altitude (le reechantillonnage d'Open-Meteo corrige alors la
 * temperature du relief) : la comparaison au releve se fait station a
 * station, jamais station a lieu.
 */
export function buildStationPointUrl(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number | null;
  readonly models: readonly ModelId[];
}): string {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(input.latitude));
  url.searchParams.set('longitude', String(input.longitude));
  if (input.elevation !== null) {
    url.searchParams.set('elevation', String(input.elevation));
  }
  url.searchParams.set(
    'models',
    input.models.map((model) => OPEN_METEO_MODEL_IDS[model]).join(','),
  );
  url.searchParams.set('hourly', 'temperature_2m');
  url.searchParams.set('past_hours', String(STATION_POINT_PAST_HOURS));
  url.searchParams.set('forecast_hours', '1');
  url.searchParams.set('timezone', 'Europe/Paris');
  return url.toString();
}

/**
 * Reponse au point de la station vers series par modele. Plusieurs modeles :
 * cles suffixees par l'identifiant Open-Meteo ; un seul : cle nue. Un
 * modele entierement vide est omis ; une valeur absente reste null.
 */
export function mapStationPoint(
  raw: RawForecastResponse,
  models: readonly ModelId[],
): HttpResult<StationModelSeries> {
  const hourly = raw.hourly;
  const time = hourly?.time as readonly LocalIsoHour[] | undefined;
  if (hourly === undefined || time === undefined) {
    return {
      ok: false,
      failure: { kind: 'malformed', detail: 'point de station sans bloc horaire' },
    };
  }
  const temperature: Partial<Record<ModelId, readonly (number | null)[]>> = {};
  for (const model of models) {
    const key =
      models.length === 1 ? 'temperature_2m' : `temperature_2m_${OPEN_METEO_MODEL_IDS[model]}`;
    const values = hourly[key] as readonly (number | null)[] | undefined;
    if (values !== undefined && values.some((value) => value !== null)) {
      temperature[model] = time.map((_, index) => values[index] ?? null);
    }
  }
  return { ok: true, value: { timeline: time, temperature } };
}

export async function fetchStationPoint(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number | null;
  readonly models: readonly ModelId[];
}): Promise<HttpResult<StationModelSeries>> {
  const result = await request<RawForecastResponse>(buildStationPointUrl(input));
  return result.ok ? mapStationPoint(result.value, input.models) : result;
}

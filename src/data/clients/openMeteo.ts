import type { ModelId } from '../../domain/types';
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
}

// ARCHITECTURE.md section 4.1. Verifie contre l'API reelle au lot 1 :
// les quatre identifiants sont exacts au 17/08/2026.
export const OPEN_METEO_MODEL_IDS: Readonly<Record<ModelId, string>> = {
  arome: 'meteofrance_arome_france_hd',
  arpege: 'meteofrance_arpege_europe',
  icon_eu: 'icon_eu',
  gfs: 'gfs_seamless',
} as const;

const HOURLY_VARIABLES = [
  'temperature_2m',
  'precipitation',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'pressure_msl',
  'dew_point_2m',
  'cloud_cover',
  'shortwave_radiation',
  'weather_code',
] as const;

const DAILY_VARIABLES = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'uv_index_max',
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

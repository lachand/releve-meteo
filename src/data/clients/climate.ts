import { NORMALS } from '../../domain/normals';
import type { ClimateDaily } from '../../domain/normals';
import { request } from './http';
import type { HttpResult } from './http';

/**
 * Maxima et minima quotidiens de la periode de reference 1991-2020, d'apres la
 * reanalyse ERA5 (archive-api.open-meteo.com) : l'entree des normales de
 * saison. Une seule requete, mise en cache longtemps ; une estimation sur une
 * maille d'environ 30 km, ramenee a l'altitude du lieu par le service.
 */

interface RawClimate {
  readonly daily?: {
    readonly time?: readonly string[];
    readonly temperature_2m_max?: readonly (number | null)[];
    readonly temperature_2m_min?: readonly (number | null)[];
  };
}

export function buildClimateUrl(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number;
}): string {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude', String(input.latitude));
  url.searchParams.set('longitude', String(input.longitude));
  url.searchParams.set('elevation', String(Math.round(input.elevation)));
  url.searchParams.set('start_date', `${NORMALS.periodStart}-01-01`);
  url.searchParams.set('end_date', `${NORMALS.periodEnd}-12-31`);
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
  url.searchParams.set('timezone', 'Europe/Paris');
  return url.toString();
}

export function mapClimate(raw: RawClimate): HttpResult<ClimateDaily> {
  const daily = raw.daily;
  const dates = daily?.time;
  const tempMax = daily?.temperature_2m_max;
  const tempMin = daily?.temperature_2m_min;
  if (
    dates === undefined ||
    tempMax === undefined ||
    tempMin === undefined ||
    tempMax.length !== dates.length ||
    tempMin.length !== dates.length
  ) {
    return {
      ok: false,
      failure: { kind: 'malformed', detail: 'climat sans series quotidiennes alignees' },
    };
  }
  return { ok: true, value: { dates, tempMax, tempMin } };
}

export async function fetchClimate(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number;
  readonly signal?: AbortSignal;
}): Promise<HttpResult<ClimateDaily>> {
  const result = await request<RawClimate>(buildClimateUrl(input), {
    signal: input.signal,
    timeoutMs: 30000,
  });
  return result.ok ? mapClimate(result.value) : result;
}

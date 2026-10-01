import type { MarineHourly } from '../../domain/marine';
import type { LocalIsoHour } from '../../domain/types';
import { request } from './http';
import type { HttpResult } from './http';

/**
 * Vagues d'Open-Meteo Marine (marine-api.open-meteo.com) : hauteur
 * significative, periode et direction, heure par heure. Seuls les lieux du
 * littoral l'interrogent ; un point sans mer repond sans valeur.
 */

interface RawMarine {
  readonly hourly?: {
    readonly time?: readonly string[];
    readonly wave_height?: readonly (number | null)[];
    readonly wave_period?: readonly (number | null)[];
    readonly wave_direction?: readonly (number | null)[];
  };
}

export const MARINE_FORECAST_DAYS = 3;

export function buildMarineUrl(latitude: number, longitude: number): string {
  const url = new URL('https://marine-api.open-meteo.com/v1/marine');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('hourly', 'wave_height,wave_period,wave_direction');
  url.searchParams.set('timezone', 'Europe/Paris');
  url.searchParams.set('forecast_days', String(MARINE_FORECAST_DAYS));
  return url.toString();
}

export function mapMarine(raw: RawMarine): HttpResult<MarineHourly> {
  const hourly = raw.hourly;
  const time = hourly?.time;
  const height = hourly?.wave_height;
  if (hourly === undefined || time === undefined || height === undefined) {
    return { ok: false, failure: { kind: 'malformed', detail: 'marine sans vagues' } };
  }
  return {
    ok: true,
    value: {
      timeline: time as readonly LocalIsoHour[],
      waveHeight: height,
      wavePeriod: hourly.wave_period ?? [],
      waveDirection: hourly.wave_direction ?? [],
    },
  };
}

export async function fetchMarine(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<HttpResult<MarineHourly>> {
  const result = await request<RawMarine>(buildMarineUrl(latitude, longitude), { signal });
  return result.ok ? mapMarine(result.value) : result;
}

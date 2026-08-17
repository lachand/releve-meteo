import type { Place } from '../../domain/types';
import { request } from './http';
import type { HttpResult } from './http';

export interface GeocodingQuery {
  readonly query: string;
  readonly count?: number; // defaut 10
}

interface RawGeocodingResult {
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly elevation: number;
  readonly admin2?: string;
}

interface RawGeocodingResponse {
  readonly results?: readonly RawGeocodingResult[];
}

export function buildGeocodingUrl(query: GeocodingQuery): string {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query.query);
  url.searchParams.set('count', String(query.count ?? 10));
  url.searchParams.set('language', 'fr');
  url.searchParams.set('format', 'json');
  // Filtre a la source cote API : cette recherche ne sert que la France
  // metropolitaine, inutile de faire remonter puis filtrer nous-memes des
  // resultats hors perimetre.
  url.searchParams.set('countryCode', 'FR');
  return url.toString();
}

function toPlace(raw: RawGeocodingResult): Place {
  return {
    id: `${raw.latitude.toFixed(4)}:${raw.longitude.toFixed(4)}`,
    name: raw.name,
    latitude: raw.latitude,
    longitude: raw.longitude,
    elevation: raw.elevation,
    admin: raw.admin2 ?? null,
    alias: null,
  };
}

export async function fetchPlaces(
  query: GeocodingQuery,
  signal?: AbortSignal,
): Promise<HttpResult<readonly Place[]>> {
  const result = await request<RawGeocodingResponse>(buildGeocodingUrl(query), { signal });
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: (result.value.results ?? []).map(toPlace) };
}

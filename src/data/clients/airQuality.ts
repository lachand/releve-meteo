import type { LocalIsoHour } from '../../domain/types';
import { request } from './http';
import type { HttpResult } from './http';

/**
 * Qualite de l'air et pollens, modele CAMS Europe (Copernicus) via
 * air-quality-api.open-meteo.com. Donnees prevues : provenance 'forecast'.
 */

export type PollenKind = 'alder' | 'birch' | 'grass' | 'mugwort' | 'olive' | 'ragweed';

export interface AirQualitySeries {
  readonly timeline: readonly LocalIsoHour[];
  readonly europeanAqi: readonly (number | null)[];
  readonly pm2_5: readonly (number | null)[];
  readonly pm10: readonly (number | null)[];
  readonly ozone: readonly (number | null)[];
  readonly nitrogenDioxide: readonly (number | null)[];
  readonly uvIndex: readonly (number | null)[];
  readonly pollen: Readonly<Record<PollenKind, readonly (number | null)[]>>;
}

const POLLEN_KEYS: Readonly<Record<PollenKind, string>> = {
  alder: 'alder_pollen',
  birch: 'birch_pollen',
  grass: 'grass_pollen',
  mugwort: 'mugwort_pollen',
  olive: 'olive_pollen',
  ragweed: 'ragweed_pollen',
};

const BASE_KEYS = [
  'european_aqi',
  'pm2_5',
  'pm10',
  'ozone',
  'nitrogen_dioxide',
  'uv_index',
] as const;

interface RawAirQuality {
  readonly hourly?: Readonly<Record<string, readonly (number | null)[] | readonly string[]>>;
}

export function buildAirQualityUrl(latitude: number, longitude: number): string {
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('hourly', [...BASE_KEYS, ...Object.values(POLLEN_KEYS)].join(','));
  url.searchParams.set('timezone', 'Europe/Paris');
  url.searchParams.set('forecast_days', '4');
  return url.toString();
}

export function mapAirQuality(raw: RawAirQuality): HttpResult<AirQualitySeries> {
  const hourly = raw.hourly;
  const time = hourly?.time;
  if (hourly === undefined || time === undefined) {
    return {
      ok: false,
      failure: { kind: 'malformed', detail: "qualite de l'air sans bloc horaire" },
    };
  }
  const length = time.length;
  const series = (key: string): readonly (number | null)[] => {
    const raw = hourly[key];
    return raw !== undefined && raw.length === length
      ? (raw as readonly (number | null)[])
      : new Array<null>(length).fill(null);
  };
  return {
    ok: true,
    value: {
      timeline: time as readonly LocalIsoHour[],
      europeanAqi: series('european_aqi'),
      pm2_5: series('pm2_5'),
      pm10: series('pm10'),
      ozone: series('ozone'),
      nitrogenDioxide: series('nitrogen_dioxide'),
      uvIndex: series('uv_index'),
      pollen: {
        alder: series(POLLEN_KEYS.alder),
        birch: series(POLLEN_KEYS.birch),
        grass: series(POLLEN_KEYS.grass),
        mugwort: series(POLLEN_KEYS.mugwort),
        olive: series(POLLEN_KEYS.olive),
        ragweed: series(POLLEN_KEYS.ragweed),
      },
    },
  };
}

export async function fetchAirQuality(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<HttpResult<AirQualitySeries>> {
  const result = await request<RawAirQuality>(buildAirQualityUrl(latitude, longitude), { signal });
  return result.ok ? mapAirQuality(result.value) : result;
}

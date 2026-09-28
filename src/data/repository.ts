import { CACHE_TTL_MS } from '../domain/constants';
import type { EnsembleHourly } from '../domain/ensemble';
import { nearestStation } from '../domain/stations';
import type { Station } from '../domain/stations';
import type { ForecastBundle, ModelId, Place } from '../domain/types';
import { fetchAirQuality } from './clients/airQuality';
import type { AirQualitySeries } from './clients/airQuality';
import { fetchEnsemble } from './clients/ensemble';
import { fetchPlaces } from './clients/geocoding';
import { request } from './clients/http';
import type { HttpResult } from './clients/http';
import { fetchForecast, fetchNowcast } from './clients/openMeteo';
import { fetchVerifications } from './clients/verification';
import type { VerificationReport } from './clients/verification';
import { getDataset, setDataset } from './cache/datasetStore';
import type { DatasetKind } from './cache/datasetStore';
import { getCachedPlaces, normalizeQuery, setCachedPlaces } from './cache/geocodingStore';
import { getCachedForecast, setCachedForecast } from './cache/forecastStore';
import { mapNowcast } from './mappers/nowcastMapper';
import type { Nowcast } from './mappers/nowcastMapper';
import { mapOpenMeteoResponse } from './mappers/openMeteoMapper';
import { enqueue } from './queue';

export interface ForecastRequest {
  readonly place: Place;
  readonly models: readonly ModelId[];
  readonly forceRefresh?: boolean;
}

export interface ForecastResult {
  readonly bundle: ForecastBundle;
  readonly fromCache: boolean;
  readonly stale: boolean; // servi hors ligne au dela du TTL
  readonly missingModels: readonly ModelId[];
}

/**
 * Un jour passe : les 24 dernieres heures s'affichent en 'estimated',
 * pour situer la prevision par rapport a ce qui vient de se passer.
 * Dix jours de deterministe : ECMWF et GFS portent la fin de la cascade,
 * l'ensemble ECMWF (15 jours) prend le relais dans la vue longue.
 */
export const PAST_DAYS = 1;
export const FORECAST_DAYS = 10;

function missingModelsOf(request: ForecastRequest, bundle: ForecastBundle): readonly ModelId[] {
  return request.models.filter((model) => bundle.series[model] === undefined);
}

export async function getForecast(request: ForecastRequest): Promise<HttpResult<ForecastResult>> {
  const cacheKey = {
    placeId: request.place.id,
    models: request.models,
    pastDays: PAST_DAYS,
    forecastDays: FORECAST_DAYS,
  };
  const now = Date.now();
  const cached = await getCachedForecast(cacheKey);

  if (!request.forceRefresh && cached !== null && cached.expiresAt > now) {
    return {
      ok: true,
      value: {
        bundle: cached.bundle,
        fromCache: true,
        stale: false,
        missingModels: missingModelsOf(request, cached.bundle),
      },
    };
  }

  const queueKey = `forecast:${cacheKey.placeId}|${[...cacheKey.models].sort().join(',')}|${cacheKey.pastDays}|${cacheKey.forecastDays}`;
  return enqueue(queueKey, async () => {
    const response = await fetchForecast({
      latitude: request.place.latitude,
      longitude: request.place.longitude,
      models: request.models,
      pastDays: PAST_DAYS,
      forecastDays: FORECAST_DAYS,
    });

    if (!response.ok) {
      if (cached !== null) {
        return {
          ok: true,
          value: {
            bundle: cached.bundle,
            fromCache: true,
            stale: true,
            missingModels: missingModelsOf(request, cached.bundle),
          },
        } satisfies HttpResult<ForecastResult>;
      }
      return response;
    }

    const mapped = mapOpenMeteoResponse({
      place: request.place,
      requestedModels: request.models,
      response: response.value,
      now: new Date(now),
      fetchedAt: now,
    });
    if (!mapped.ok) {
      return mapped;
    }

    await setCachedForecast(cacheKey, mapped.value.bundle, now, now + CACHE_TTL_MS.forecast);
    return {
      ok: true,
      value: {
        bundle: mapped.value.bundle,
        fromCache: false,
        stale: false,
        missingModels: mapped.value.missingModels,
      },
    } satisfies HttpResult<ForecastResult>;
  });
}

export async function searchPlaces(query: string): Promise<HttpResult<readonly Place[]>> {
  const now = Date.now();
  const cached = await getCachedPlaces(query);
  if (cached !== null && cached.expiresAt > now) {
    return { ok: true, value: cached.places };
  }

  return enqueue(`geocoding:${normalizeQuery(query)}`, async () => {
    const result = await fetchPlaces({ query });
    if (result.ok) {
      await setCachedPlaces(query, result.value, now, now + CACHE_TTL_MS.geocoding);
    }
    return result;
  });
}

/** Resultat d'un jeu de donnees secondaire, avec son horodatage. */
export interface DatasetResult<T> {
  readonly value: T;
  readonly fetchedAt: number;
  readonly stale: boolean;
}

/**
 * Lecture a travers le cache generique : frais -> cache ; sinon reseau ;
 * reseau en echec -> copie perimee si elle existe (stale), sinon l'echec.
 */
async function throughCache<T>(input: {
  readonly kind: DatasetKind;
  readonly placeId: string;
  readonly ttlMs: number;
  readonly fetcher: () => Promise<HttpResult<T>>;
}): Promise<HttpResult<DatasetResult<T>>> {
  const now = Date.now();
  const cached = await getDataset<T>(input.kind, input.placeId);
  if (cached !== null && cached.expiresAt > now) {
    return { ok: true, value: { value: cached.value, fetchedAt: cached.storedAt, stale: false } };
  }
  return enqueue(`${input.kind}:${input.placeId}`, async () => {
    const result = await input.fetcher();
    if (!result.ok) {
      if (cached !== null) {
        return {
          ok: true,
          value: { value: cached.value, fetchedAt: cached.storedAt, stale: true },
        } satisfies HttpResult<DatasetResult<T>>;
      }
      return result;
    }
    await setDataset(input.kind, input.placeId, result.value, now, now + input.ttlMs);
    return {
      ok: true,
      value: { value: result.value, fetchedAt: now, stale: false },
    } satisfies HttpResult<DatasetResult<T>>;
  });
}

export function getEnsemble(place: Place): Promise<HttpResult<DatasetResult<EnsembleHourly>>> {
  return throughCache({
    kind: 'ensemble',
    placeId: place.id,
    ttlMs: CACHE_TTL_MS.ensemble,
    fetcher: () => fetchEnsemble(place.latitude, place.longitude),
  });
}

let stationsPromise: Promise<readonly Station[]> | null = null;

/**
 * Stations d'observation de France metropolitaine, liste statique generee
 * par `scripts/generate-stations.py` et servie avec l'application (donc
 * disponible hors ligne). Liste vide si le fichier manque : la
 * verification se replie alors sur la reanalyse.
 */
export function loadStations(): Promise<readonly Station[]> {
  stationsPromise ??= request<readonly Station[]>('/data/stations-fr.json', { retries: 0 }).then(
    (result) => (result.ok && Array.isArray(result.value) ? result.value : []),
  );
  return stationsPromise;
}

/** Reinitialise la liste memorisee. Utilise par les tests. */
export function resetStationsForTests(): void {
  stationsPromise = null;
}

export async function getVerifications(
  place: Place,
  models: readonly ModelId[],
): Promise<HttpResult<DatasetResult<VerificationReport>>> {
  const station = nearestStation({
    latitude: place.latitude,
    longitude: place.longitude,
    elevation: place.elevation,
    stations: await loadStations(),
  });
  return throughCache({
    kind: 'verification',
    placeId: `${place.id}|${[...models].sort().join(',')}`,
    ttlMs: CACHE_TTL_MS.verification,
    fetcher: () =>
      fetchVerifications({
        latitude: place.latitude,
        longitude: place.longitude,
        models,
        station,
        now: new Date(),
      }),
  });
}

export function getAirQuality(place: Place): Promise<HttpResult<DatasetResult<AirQualitySeries>>> {
  return throughCache({
    kind: 'airQuality',
    placeId: place.id,
    ttlMs: CACHE_TTL_MS.airQuality,
    fetcher: () => fetchAirQuality(place.latitude, place.longitude),
  });
}

export function getNowcast(place: Place): Promise<HttpResult<DatasetResult<Nowcast>>> {
  return throughCache({
    kind: 'nowcast',
    placeId: place.id,
    ttlMs: CACHE_TTL_MS.nowcast,
    fetcher: async () => {
      const result = await fetchNowcast(place.latitude, place.longitude);
      return result.ok ? mapNowcast(result.value) : result;
    },
  });
}

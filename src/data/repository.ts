import { CACHE_TTL_MS } from '../domain/constants';
import type { ForecastBundle, ModelId, Place } from '../domain/types';
import { fetchPlaces } from './clients/geocoding';
import type { HttpResult } from './clients/http';
import { fetchForecast } from './clients/openMeteo';
import { getCachedPlaces, normalizeQuery, setCachedPlaces } from './cache/geocodingStore';
import { getCachedForecast, setCachedForecast } from './cache/forecastStore';
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

// Lot 1 ne couvre que la prevision courante : ni le repli sur l'observe
// (Lot 4) ni l'archivage de fiabilite (Lot 7) n'exigent encore past_days.
const PAST_DAYS = 0;
const FORECAST_DAYS = 7;

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

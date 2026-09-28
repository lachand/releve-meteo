import type { ForecastBundle, ModelId } from '../../domain/types';
import { getDb } from './db';

export interface ForecastCacheKey {
  readonly placeId: string;
  readonly models: readonly ModelId[];
  readonly pastDays: number;
  readonly forecastDays: number;
}

export interface CachedForecast {
  readonly bundle: ForecastBundle;
  readonly storedAt: number;
  readonly expiresAt: number;
}

/**
 * Version de la forme de `ForecastBundle`. Incrementee a chaque ajout de
 * champ dans `HourlyPoint` / `DailyPoint` : un bundle mis en cache par une
 * version anterieure n'a pas les nouveaux champs et ne doit jamais etre
 * relu (il ferait lire `undefined.value`).
 */
export const BUNDLE_SCHEMA_VERSION = 2;

function cacheKey({ placeId, models, pastDays, forecastDays }: ForecastCacheKey): string {
  const modelsHash = [...models].sort().join(',');
  return `v${BUNDLE_SCHEMA_VERSION}|${placeId}|${modelsHash}|${pastDays}|${forecastDays}`;
}

const memoryStore = new Map<string, CachedForecast>();

export async function getCachedForecast(input: ForecastCacheKey): Promise<CachedForecast | null> {
  const key = cacheKey(input);
  const db = await getDb();
  if (db === null) {
    return memoryStore.get(key) ?? null;
  }
  const record = await db.get('forecasts', key);
  if (record === undefined) {
    return null;
  }
  const { bundle, storedAt, expiresAt } = record;
  return { bundle, storedAt, expiresAt };
}

export async function setCachedForecast(
  input: ForecastCacheKey,
  bundle: ForecastBundle,
  storedAt: number,
  expiresAt: number,
): Promise<void> {
  const key = cacheKey(input);
  const entry: CachedForecast = { bundle, storedAt, expiresAt };
  const db = await getDb();
  if (db === null) {
    memoryStore.set(key, entry);
    return;
  }
  await db.put('forecasts', { key, ...entry });
}

/** Purge les entrees expirees. Utilise sous pression de stockage (Lot 3). */
export async function pruneExpiredForecasts(now: number): Promise<void> {
  const db = await getDb();
  if (db === null) {
    for (const [key, entry] of memoryStore) {
      if (entry.expiresAt < now) {
        memoryStore.delete(key);
      }
    }
    return;
  }
  const tx = db.transaction('forecasts', 'readwrite');
  let cursor = await tx.store.index('byExpiry').openCursor(IDBKeyRange.upperBound(now));
  while (cursor !== null) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/** Reinitialise le repli memoire. Utilise par les tests. */
export function resetMemoryForecastStore(): void {
  memoryStore.clear();
}

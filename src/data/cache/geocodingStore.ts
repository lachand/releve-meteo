import type { Place } from '../../domain/types';
import { getDb } from './db';

export interface CachedPlaces {
  readonly places: readonly Place[];
  readonly storedAt: number;
  readonly expiresAt: number;
}

/** Cle normalisee : minuscules, sans accents, espaces superflus retires. */
export function normalizeQuery(query: string): string {
  return query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

const memoryStore = new Map<string, CachedPlaces>();

export async function getCachedPlaces(query: string): Promise<CachedPlaces | null> {
  const key = normalizeQuery(query);
  const db = await getDb();
  if (db === null) {
    return memoryStore.get(key) ?? null;
  }
  const record = await db.get('geocoding', key);
  if (record === undefined) {
    return null;
  }
  const { places, storedAt, expiresAt } = record;
  return { places, storedAt, expiresAt };
}

export async function setCachedPlaces(
  query: string,
  places: readonly Place[],
  storedAt: number,
  expiresAt: number,
): Promise<void> {
  const key = normalizeQuery(query);
  const entry: CachedPlaces = { places, storedAt, expiresAt };
  const db = await getDb();
  if (db === null) {
    memoryStore.set(key, entry);
    return;
  }
  await db.put('geocoding', { key, ...entry });
}

export async function pruneExpiredPlaces(now: number): Promise<void> {
  const db = await getDb();
  if (db === null) {
    for (const [key, entry] of memoryStore) {
      if (entry.expiresAt < now) {
        memoryStore.delete(key);
      }
    }
    return;
  }
  const tx = db.transaction('geocoding', 'readwrite');
  let cursor = await tx.store.index('byExpiry').openCursor(IDBKeyRange.upperBound(now));
  while (cursor !== null) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/** Reinitialise le repli memoire. Utilise par les tests. */
export function resetMemoryGeocodingStore(): void {
  memoryStore.clear();
}

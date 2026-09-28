import { getDb } from './db';

/**
 * Cache generique a expiration pour les jeux de donnees secondaires
 * (ensemble, verification, qualite de l'air, releve de station). Meme contrat que
 * forecastStore : repli memoire si IndexedDB est indisponible, aucune
 * exception propagee.
 */

export type DatasetKind =
  'ensemble' | 'verification' | 'airQuality' | 'nowcast' | 'station' | 'grid';

export interface CachedDataset<T> {
  readonly value: T;
  readonly storedAt: number;
  readonly expiresAt: number;
}

/** Version de forme par type de jeu : a incrementer si la structure change. */
const DATASET_SCHEMA: Readonly<Record<DatasetKind, number>> = {
  ensemble: 1,
  // v2 : verification a l'altitude de la station.
  verification: 2,
  airQuality: 1,
  nowcast: 1,
  // v2 : temperatures des modeles au point de la station.
  station: 2,
  grid: 1,
};

function keyOf(kind: DatasetKind, placeId: string): string {
  return `${kind}.v${DATASET_SCHEMA[kind]}|${placeId}`;
}

const memoryStore = new Map<string, CachedDataset<unknown>>();

export async function getDataset<T>(
  kind: DatasetKind,
  placeId: string,
): Promise<CachedDataset<T> | null> {
  const key = keyOf(kind, placeId);
  try {
    const db = await getDb();
    if (db === null) {
      return (memoryStore.get(key) as CachedDataset<T> | undefined) ?? null;
    }
    const record = await db.get('datasets', key);
    if (record === undefined) {
      return null;
    }
    return { value: record.value as T, storedAt: record.storedAt, expiresAt: record.expiresAt };
  } catch {
    return null;
  }
}

export async function setDataset<T>(
  kind: DatasetKind,
  placeId: string,
  value: T,
  storedAt: number,
  expiresAt: number,
): Promise<void> {
  const key = keyOf(kind, placeId);
  try {
    const db = await getDb();
    if (db === null) {
      memoryStore.set(key, { value, storedAt, expiresAt });
      return;
    }
    await db.put('datasets', { key, value, storedAt, expiresAt });
  } catch {
    memoryStore.set(key, { value, storedAt, expiresAt });
  }
}

/** Purge les jeux expires depuis plus de `graceMs` (garde un repli hors ligne). */
export async function pruneExpiredDatasets(now: number, graceMs: number): Promise<void> {
  const limit = now - graceMs;
  const db = await getDb();
  if (db === null) {
    for (const [key, entry] of memoryStore) {
      if (entry.expiresAt < limit) {
        memoryStore.delete(key);
      }
    }
    return;
  }
  const tx = db.transaction('datasets', 'readwrite');
  let cursor = await tx.store.index('byExpiry').openCursor(IDBKeyRange.upperBound(limit));
  while (cursor !== null) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/** Reinitialise le repli memoire. Utilise par les tests. */
export function resetMemoryDatasetStore(): void {
  memoryStore.clear();
}

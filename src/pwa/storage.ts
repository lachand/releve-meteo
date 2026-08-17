import { pruneExpiredForecasts } from '../data/cache/forecastStore';
import { TILES_CACHE_NAME } from './cacheNames';

async function trimTileCache(maxEntries: number): Promise<void> {
  if (typeof caches === 'undefined') {
    return;
  }
  const cache = await caches.open(TILES_CACHE_NAME);
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i += 1) {
    const key = keys[i];
    if (key !== undefined) {
      await cache.delete(key);
    }
  }
}

/**
 * A appeler au demarrage de l'application et apres chaque ecriture
 * importante (SERVICE_WORKER.md section 8). Ne fait rien tant que le
 * quota reste sous 80 % : la purge a un cout (re-telechargements) qui ne
 * se justifie que sous pression reelle.
 */
export async function ensureStorageHeadroom(now: number): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.storage?.estimate === undefined) {
    return;
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  if (quota > 0 && usage / quota > 0.8) {
    await trimTileCache(150);
    await pruneExpiredForecasts(now);
  }
}

let persistRequested = false;

/**
 * A appeler une seule fois, apres que l'utilisateur a enregistre son
 * premier favori (SERVICE_WORKER.md section 8) : demander a froid au
 * premier chargement est refuse par la plupart des navigateurs et
 * gaspille l'unique occasion. Les favoris arrivent au lot 5 ; cette
 * fonction est prete mais son site d'appel n'existe pas encore, cf.
 * BACKLOG.md "Ecarts constates".
 */
export async function requestPersistentStorageOnce(): Promise<void> {
  if (persistRequested) {
    return;
  }
  if (typeof navigator === 'undefined' || navigator.storage?.persist === undefined) {
    return;
  }
  persistRequested = true;
  await navigator.storage.persist();
}

/** Reinitialise le garde-fou d'appel unique. Utilise par les tests. */
export function resetPersistentStorageGuardForTests(): void {
  persistRequested = false;
}

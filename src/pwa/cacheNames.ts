/**
 * Noms et constantes de cache partages entre le service worker (bundle
 * separe, voir SERVICE_WORKER.md section 2) et le code cote page qui gere
 * le quota de stockage (`pwa/storage.ts`). Le cache de tuiles est
 * volontairement versionne a la main, jamais sur `__BUILD_ID__` : il doit
 * survivre aux deploiements (section 2).
 */
export const CACHE_PREFIX = 'meteo-fr';
export const TILES_CACHE_NAME = `${CACHE_PREFIX}-tiles-v1`;
export const TILE_TTL_MS = 15 * 60 * 1000;
export const TILE_CACHE_MAX_ENTRIES = 300;

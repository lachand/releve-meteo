import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as forecastStore from '../data/cache/forecastStore';
import {
  ensureStorageHeadroom,
  requestPersistentStorageOnce,
  resetPersistentStorageGuardForTests,
} from './storage';

vi.mock('../data/cache/forecastStore', () => ({
  pruneExpiredForecasts: vi.fn(),
}));

function stubNavigatorStorage(overrides: Partial<StorageManager> | undefined): void {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: overrides,
  });
}

function stubCaches(keys: readonly string[]): { open: ReturnType<typeof vi.fn> } {
  const cacheDelete = vi.fn().mockResolvedValue(true);
  const cache = { keys: vi.fn().mockResolvedValue(keys), delete: cacheDelete };
  const open = vi.fn().mockResolvedValue(cache);
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open } });
  return { open };
}

describe('ensureStorageHeadroom', () => {
  afterEach(() => {
    vi.mocked(forecastStore.pruneExpiredForecasts).mockClear();
  });

  it('ne purge rien sous 80 % de quota', async () => {
    stubNavigatorStorage({ estimate: vi.fn().mockResolvedValue({ usage: 50, quota: 100 }) });
    stubCaches([]);

    await ensureStorageHeadroom(1000);

    expect(forecastStore.pruneExpiredForecasts).not.toHaveBeenCalled();
  });

  it('purge le cache de tuiles et les previsions expirees au-dela de 80 % de quota', async () => {
    stubNavigatorStorage({ estimate: vi.fn().mockResolvedValue({ usage: 90, quota: 100 }) });
    const overflow = Array.from({ length: 155 }, (_, i) => `/tile-${i}.png`);
    const { open } = stubCaches(overflow);

    await ensureStorageHeadroom(1000);

    expect(open).toHaveBeenCalledWith('meteo-fr-tiles-v1');
    const cache = await open.mock.results[0]?.value;
    expect(cache.delete).toHaveBeenCalledTimes(5); // 155 - 150 (SERVICE_WORKER.md section 8)
    expect(forecastStore.pruneExpiredForecasts).toHaveBeenCalledWith(1000);
  });

  it("ne fait rien si l'API storage est indisponible", async () => {
    stubNavigatorStorage(undefined);

    await expect(ensureStorageHeadroom(1000)).resolves.toBeUndefined();
    expect(forecastStore.pruneExpiredForecasts).not.toHaveBeenCalled();
  });

  it('ne fait rien si le quota rendu est nul', async () => {
    stubNavigatorStorage({ estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 0 }) });

    await ensureStorageHeadroom(1000);

    expect(forecastStore.pruneExpiredForecasts).not.toHaveBeenCalled();
  });
});

describe('requestPersistentStorageOnce', () => {
  beforeEach(() => {
    resetPersistentStorageGuardForTests();
  });

  it('appelle navigator.storage.persist() une seule fois', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    stubNavigatorStorage({ persist });

    await requestPersistentStorageOnce();
    await requestPersistentStorageOnce();

    expect(persist).toHaveBeenCalledOnce();
  });

  it("ne fait rien si l'API persist est indisponible", async () => {
    stubNavigatorStorage({});

    await expect(requestPersistentStorageOnce()).resolves.toBeUndefined();
  });
});

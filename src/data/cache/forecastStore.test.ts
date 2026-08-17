import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ForecastBundle, Place } from '../../domain/types';
import { deleteDbForTests, resetDbConnection } from './db';
import {
  getCachedForecast,
  pruneExpiredForecasts,
  resetMemoryForecastStore,
  setCachedForecast,
} from './forecastStore';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

const bundle: ForecastBundle = { place, fetchedAt: 0, timeline: [], series: {} };

beforeEach(async () => {
  await deleteDbForTests();
  resetMemoryForecastStore();
});

describe('forecastStore, indexedDB reelle (fake-indexeddb)', () => {
  it('retourne null quand aucune entree ne correspond', async () => {
    const result = await getCachedForecast({
      placeId: place.id,
      models: ['arome'],
      pastDays: 0,
      forecastDays: 7,
    });
    expect(result).toBeNull();
  });

  it("stocke puis relit un bundle, l'ordre des modeles n'affecte pas la cle", async () => {
    const input = {
      placeId: place.id,
      models: ['gfs', 'arome'] as const,
      pastDays: 0,
      forecastDays: 7,
    };
    await setCachedForecast(input, bundle, 1000, 5000);
    const result = await getCachedForecast({
      placeId: place.id,
      models: ['arome', 'gfs'],
      pastDays: 0,
      forecastDays: 7,
    });
    expect(result).toEqual({ bundle, storedAt: 1000, expiresAt: 5000 });
  });

  it('purge les entrees expirees', async () => {
    const input = { placeId: place.id, models: ['arome'] as const, pastDays: 0, forecastDays: 7 };
    await setCachedForecast(input, bundle, 0, 1000);
    await pruneExpiredForecasts(2000);
    expect(await getCachedForecast(input)).toBeNull();
  });

  it('conserve les entrees non expirees lors de la purge', async () => {
    const input = { placeId: place.id, models: ['arome'] as const, pastDays: 0, forecastDays: 7 };
    await setCachedForecast(input, bundle, 0, 5000);
    await pruneExpiredForecasts(2000);
    expect(await getCachedForecast(input)).not.toBeNull();
  });
});

describe('forecastStore, repli memoire quand indexedDB est indisponible', () => {
  const originalIndexedDb = globalThis.indexedDB;

  beforeEach(() => {
    // @ts-expect-error simule un environnement sans IndexedDB (mode prive strict)
    delete globalThis.indexedDB;
    resetDbConnection();
  });

  afterEach(() => {
    globalThis.indexedDB = originalIndexedDb;
    resetDbConnection();
  });

  it('reste fonctionnel sans indexedDB', async () => {
    const input = { placeId: place.id, models: ['arome'] as const, pastDays: 0, forecastDays: 7 };
    await setCachedForecast(input, bundle, 0, 5000);
    expect(await getCachedForecast(input)).toEqual({ bundle, storedAt: 0, expiresAt: 5000 });
  });

  it('purge aussi le repli memoire', async () => {
    const input = { placeId: place.id, models: ['arome'] as const, pastDays: 0, forecastDays: 7 };
    await setCachedForecast(input, bundle, 0, 1000);
    await pruneExpiredForecasts(2000);
    expect(await getCachedForecast(input)).toBeNull();
  });
});

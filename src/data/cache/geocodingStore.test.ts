import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Place } from '../../domain/types';
import { deleteDbForTests, resetDbConnection } from './db';
import {
  getCachedPlaces,
  normalizeQuery,
  pruneExpiredPlaces,
  resetMemoryGeocodingStore,
  setCachedPlaces,
} from './geocodingStore';

const places: readonly Place[] = [
  {
    id: '45.4840:5.4759',
    name: 'Virieu',
    latitude: 45.484,
    longitude: 5.4759,
    elevation: 415,
    admin: 'Isère',
    alias: null,
  },
];

beforeEach(async () => {
  await deleteDbForTests();
  resetMemoryGeocodingStore();
});

describe('normalizeQuery', () => {
  it('met en minuscules et retire les accents', () => {
    expect(normalizeQuery('Val-de-Virieu, Isère')).toBe('val-de-virieu, isere');
  });

  it('retire les espaces superflus en debut et fin', () => {
    expect(normalizeQuery('  Grenoble  ')).toBe('grenoble');
  });
});

describe('geocodingStore, indexedDB reelle (fake-indexeddb)', () => {
  it('retourne null quand aucune entree ne correspond', async () => {
    expect(await getCachedPlaces('Grenoble')).toBeNull();
  });

  it('stocke puis relit sous la cle normalisee', async () => {
    await setCachedPlaces('Val de Virieu', places, 1000, 5000);
    const result = await getCachedPlaces('VAL DE VIRIEU');
    expect(result).toEqual({ places, storedAt: 1000, expiresAt: 5000 });
  });

  it('purge les entrees expirees', async () => {
    await setCachedPlaces('Grenoble', places, 0, 1000);
    await pruneExpiredPlaces(2000);
    expect(await getCachedPlaces('Grenoble')).toBeNull();
  });
});

describe('geocodingStore, repli memoire quand indexedDB est indisponible', () => {
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
    await setCachedPlaces('Grenoble', places, 0, 5000);
    expect(await getCachedPlaces('Grenoble')).toEqual({ places, storedAt: 0, expiresAt: 5000 });
  });

  it('purge aussi le repli memoire', async () => {
    await setCachedPlaces('Grenoble', places, 0, 1000);
    await pruneExpiredPlaces(2000);
    expect(await getCachedPlaces('Grenoble')).toBeNull();
  });
});

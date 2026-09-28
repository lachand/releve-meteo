import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ForecastBundle, Place } from '../../domain/types';
import { deleteDbForTests, DB_VERSION, getDb, resetDbConnection, upgrade } from './db';
import type { DbSchema } from './db';

// Doit rester identique au DB_NAME prive de db.ts : ce test ouvre directement
// la meme base pour simuler un client qui n'a encore que le schema v1.
const DB_NAME = 'meteo-fr';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

const bundle: ForecastBundle = {
  place,
  fetchedAt: 1000,
  timeline: ['2026-08-17T00:00'],
  series: {},
};

/** Schema v1 d'origine (avant l'ajout du magasin `datasets`), pour amorcer la migration. */
function upgradeToV1Only(db: IDBPDatabase<DbSchema>): void {
  db.createObjectStore('forecasts', { keyPath: 'key' }).createIndex('byExpiry', 'expiresAt');
  db.createObjectStore('geocoding', { keyPath: 'key' }).createIndex('byExpiry', 'expiresAt');
}

beforeEach(async () => {
  await deleteDbForTests();
});

afterEach(async () => {
  await deleteDbForTests();
});

describe('DB_VERSION', () => {
  it('est passee en version 2', () => {
    expect(DB_VERSION).toBe(2);
  });
});

describe('migration v1 -> v2', () => {
  it('conserve les previsions existantes et ajoute le magasin datasets', async () => {
    const v1 = await openDB<DbSchema>(DB_NAME, 1, { upgrade: upgradeToV1Only });
    await v1.put('forecasts', { key: 'v1-key', bundle, storedAt: 0, expiresAt: 9_999_999_999_999 });
    v1.close();
    resetDbConnection();

    const db = await getDb();
    expect(db).not.toBeNull();
    if (db === null) return;

    expect(db.objectStoreNames.contains('forecasts')).toBe(true);
    expect(db.objectStoreNames.contains('geocoding')).toBe(true);
    expect(db.objectStoreNames.contains('datasets')).toBe(true);

    const migrated = await db.get('forecasts', 'v1-key');
    expect(migrated?.bundle).toEqual(bundle);
    expect(migrated?.storedAt).toBe(0);
  });

  it('rend le magasin datasets immediatement utilisable apres migration', async () => {
    const v1 = await openDB<DbSchema>(DB_NAME, 1, { upgrade: upgradeToV1Only });
    v1.close();
    resetDbConnection();

    const db = await getDb();
    expect(db).not.toBeNull();
    if (db === null) return;

    await db.put('datasets', {
      key: 'ensemble.v1|place',
      value: { ok: true },
      storedAt: 0,
      expiresAt: 1,
    });
    const record = await db.get('datasets', 'ensemble.v1|place');
    expect(record?.value).toEqual({ ok: true });
  });

  it('applique la migration via la fonction upgrade exportee, en une seule passe depuis zero', async () => {
    resetDbConnection();
    const db = await getDb();
    expect(db).not.toBeNull();
    if (db === null) return;
    expect(db.objectStoreNames.contains('forecasts')).toBe(true);
    expect(db.objectStoreNames.contains('geocoding')).toBe(true);
    expect(db.objectStoreNames.contains('datasets')).toBe(true);
  });

  it('upgrade ne recree rien quand oldVersion couvre deja le magasin datasets', () => {
    // Filet de securite explicite sur le garde `oldVersion < 2` : un appel
    // avec oldVersion=2 ne doit tenter de recreer aucun magasin existant.
    expect(() => {
      const noop = { createObjectStore: () => ({ createIndex: () => undefined }) };
      upgrade(noop as unknown as IDBPDatabase<DbSchema>, 2);
    }).not.toThrow();
  });
});

describe('getDb sans indexedDB', () => {
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

  it('retourne null plutot que de lever', async () => {
    expect(await getDb()).toBeNull();
  });

  it('memorise la connexion (meme promesse tant que resetDbConnection n a pas ete appele)', async () => {
    const first = getDb();
    const second = getDb();
    expect(first).toBe(second);
    expect(await first).toBeNull();
  });
});

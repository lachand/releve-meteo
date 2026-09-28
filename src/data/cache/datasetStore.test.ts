import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDbForTests, resetDbConnection } from './db';
import {
  getDataset,
  pruneExpiredDatasets,
  resetMemoryDatasetStore,
  setDataset,
} from './datasetStore';

interface Payload {
  readonly value: number;
}

beforeEach(async () => {
  await deleteDbForTests();
  resetMemoryDatasetStore();
});

describe('datasetStore, indexedDB reelle (fake-indexeddb)', () => {
  it('retourne null quand aucune entree ne correspond', async () => {
    expect(await getDataset<Payload>('ensemble', 'place-1')).toBeNull();
  });

  it('stocke puis relit un jeu de donnees', async () => {
    await setDataset<Payload>('ensemble', 'place-1', { value: 42 }, 1000, 5000);
    const result = await getDataset<Payload>('ensemble', 'place-1');
    expect(result).toEqual({ value: { value: 42 }, storedAt: 1000, expiresAt: 5000 });
  });

  it('isole les entrees par type de jeu de donnees pour un meme lieu', async () => {
    await setDataset<Payload>('ensemble', 'place-1', { value: 1 }, 0, 1000);
    await setDataset<Payload>('airQuality', 'place-1', { value: 2 }, 0, 1000);
    expect((await getDataset<Payload>('ensemble', 'place-1'))?.value).toEqual({ value: 1 });
    expect((await getDataset<Payload>('airQuality', 'place-1'))?.value).toEqual({ value: 2 });
  });

  it('isole les entrees par lieu pour un meme type', async () => {
    await setDataset<Payload>('nowcast', 'place-1', { value: 1 }, 0, 1000);
    await setDataset<Payload>('nowcast', 'place-2', { value: 2 }, 0, 1000);
    expect((await getDataset<Payload>('nowcast', 'place-1'))?.value).toEqual({ value: 1 });
    expect((await getDataset<Payload>('nowcast', 'place-2'))?.value).toEqual({ value: 2 });
  });

  it('purge les entrees expirees depuis plus de graceMs', async () => {
    await setDataset<Payload>('verification', 'place-1', { value: 1 }, 0, 1000);
    await pruneExpiredDatasets(5000, 1000); // limite = 4000, 1000 < 4000 : purgee
    expect(await getDataset<Payload>('verification', 'place-1')).toBeNull();
  });

  it('conserve une entree expiree mais encore dans la grace', async () => {
    await setDataset<Payload>('verification', 'place-1', { value: 1 }, 0, 4500);
    await pruneExpiredDatasets(5000, 1000); // limite = 4000, 4500 >= 4000 : encore dans la grace
    expect(await getDataset<Payload>('verification', 'place-1')).not.toBeNull();
  });

  it('conserve une entree non expiree', async () => {
    await setDataset<Payload>('verification', 'place-1', { value: 1 }, 0, 9000);
    await pruneExpiredDatasets(5000, 1000); // limite = 4000, 9000 > 4000 : conservee
    expect(await getDataset<Payload>('verification', 'place-1')).not.toBeNull();
  });
});

describe('datasetStore, repli memoire quand indexedDB est indisponible', () => {
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
    await setDataset<Payload>('ensemble', 'place-1', { value: 7 }, 0, 5000);
    expect(await getDataset<Payload>('ensemble', 'place-1')).toEqual({
      value: { value: 7 },
      storedAt: 0,
      expiresAt: 5000,
    });
  });

  it('purge aussi le repli memoire', async () => {
    await setDataset<Payload>('ensemble', 'place-1', { value: 7 }, 0, 1000);
    await pruneExpiredDatasets(5000, 0);
    expect(await getDataset<Payload>('ensemble', 'place-1')).toBeNull();
  });

  it('resetMemoryDatasetStore vide le repli memoire', async () => {
    await setDataset<Payload>('ensemble', 'place-1', { value: 7 }, 0, 5000);
    resetMemoryDatasetStore();
    expect(await getDataset<Payload>('ensemble', 'place-1')).toBeNull();
  });
});

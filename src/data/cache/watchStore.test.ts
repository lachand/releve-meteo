import { beforeEach, describe, expect, it } from 'vitest';
import type { WatchEntry } from '../../domain/watch';
import { deleteDbForTests } from './db';
import { resetMemoryDatasetStore, setDataset } from './datasetStore';
import { markNotified, readWatchState, saveWatchEntries } from './watchStore';

const NOW = new Date('2026-09-28T13:27:00Z');
const HOUR = 60 * 60 * 1000;

const ENTRY: WatchEntry = {
  place: {
    id: 'lyon',
    name: 'Lyon',
    latitude: 45.75,
    longitude: 4.83,
    elevation: 170,
    admin: 'Rhône',
    alias: null,
  },
  department: { code: '69', name: 'Rhône' },
  rules: [],
  terrain: null,
  verification: [],
  preferred: null,
};

beforeEach(async () => {
  await deleteDbForTests();
  resetMemoryDatasetStore();
});

describe('watchStore', () => {
  it('part d un etat vide, et d un etat vide encore si le stockage est illisible', async () => {
    expect(await readWatchState()).toEqual({
      entries: [],
      windUnit: 'kmh',
      notified: {},
      lastRunUtcMs: null,
    });
    await setDataset('watch', 'all', { entries: 'oups' }, 0, 1);
    expect((await readWatchState()).entries).toEqual([]);
  });

  it('recopie les lieux sans toucher a ce qui a ete notifie', async () => {
    await markNotified(['a'], NOW, NOW.getTime());
    await saveWatchEntries([ENTRY], 'kt', NOW);
    expect(await readWatchState()).toEqual({
      entries: [ENTRY],
      windUnit: 'kt',
      notified: { a: NOW.getTime() },
      lastRunUtcMs: NOW.getTime(),
    });
  });

  it('note les cles nouvelles, garde la date des anciennes et oublie les trop vieilles', async () => {
    const earlier = new Date(NOW.getTime() - 2 * HOUR);
    await markNotified(['vieille'], new Date(NOW.getTime() - 100 * HOUR));
    await markNotified(['gardee'], earlier);
    // Deja connue, sans veille a dater : rien a ecrire.
    await markNotified(['gardee'], NOW);
    await markNotified(['gardee', 'nouvelle'], NOW);
    const state = await readWatchState();
    expect(state.notified).toEqual({ gardee: earlier.getTime(), nouvelle: NOW.getTime() });
    expect(state.lastRunUtcMs).toBeNull();
  });
});

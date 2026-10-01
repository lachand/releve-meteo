import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JournalEntry } from '../../domain/journal';
import { deleteDbForTests } from './db';
import { resetMemoryDatasetStore, setDataset } from './datasetStore';
import { loadJournal, recordJournal } from './journalStore';

const NOW = new Date('2026-09-29T08:00:00Z');

function entry(date: string): JournalEntry {
  return {
    date,
    stationName: 'Lyon / Bron',
    hours: 24,
    observedMin: 11,
    observedMax: 22,
    models: [{ model: 'icon_d2', mae: 0.9, bias: -0.2 }],
  };
}

beforeEach(async () => {
  resetMemoryDatasetStore();
  await deleteDbForTests();
});
afterEach(() => resetMemoryDatasetStore());

describe('journalStore', () => {
  it('rend un journal vide pour un lieu sans bilan', async () => {
    expect(await loadJournal('lyon')).toEqual([]);
  });

  it('enregistre le bilan par lieu, du plus recent au plus ancien, sans doublon', async () => {
    await recordJournal('lyon', entry('2026-09-27'), NOW);
    await recordJournal('lyon', entry('2026-09-28'), NOW);
    const journal = await recordJournal('lyon', entry('2026-09-27'), NOW);
    expect(journal.map((e) => e.date)).toEqual(['2026-09-28', '2026-09-27']);
    expect((await loadJournal('lyon')).map((e) => e.date)).toEqual(['2026-09-28', '2026-09-27']);
    // Un autre lieu a son propre journal.
    expect(await loadJournal('brest')).toEqual([]);
  });

  it('ecarte les entrees abimees d un enregistrement ancien ou illisible', async () => {
    await setDataset(
      'journal',
      'lyon',
      [entry('2026-09-26'), { date: 'x' }, null],
      NOW.getTime(),
      NOW.getTime() + 1000,
    );
    expect((await loadJournal('lyon')).map((e) => e.date)).toEqual(['2026-09-26']);
    await setDataset('journal', 'brest', 'pas une liste', NOW.getTime(), NOW.getTime() + 1000);
    expect(await loadJournal('brest')).toEqual([]);
  });
});

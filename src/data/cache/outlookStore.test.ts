import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OutlookIssue } from '../../domain/forecastDrift';
import { resetMemoryDatasetStore, setDataset } from './datasetStore';
import { deleteDbForTests } from './db';
import { loadOutlooks, recordOutlook } from './outlookStore';

const NOW = new Date('2026-10-03T19:30:00Z');
const HOUR = 60 * 60 * 1000;

function issue(hoursAgo: number): OutlookIssue {
  return {
    issuedAt: NOW.getTime() - hoursAgo * HOUR,
    days: [{ date: '2026-10-04', model: 'arome', tempMax: 18, tempMin: 8, rain: 0 }],
  };
}

beforeEach(async () => {
  resetMemoryDatasetStore();
  await deleteDbForTests();
});
afterEach(() => resetMemoryDatasetStore());

describe('outlookStore', () => {
  it('rend rien pour un lieu sans prevision gardee', async () => {
    expect(await loadOutlooks('lyon')).toEqual([]);
  });

  it('garde les previsions par lieu, de la plus recente a la plus ancienne', async () => {
    await recordOutlook('lyon', issue(24), NOW);
    const merged = await recordOutlook('lyon', issue(0), NOW);
    expect(merged.map((m) => m.issuedAt)).toEqual([issue(0).issuedAt, issue(24).issuedAt]);
    expect(await loadOutlooks('brest')).toEqual([]);
  });

  it('ecarte un enregistrement abime sans casser', async () => {
    await setDataset(
      'outlooks',
      'lyon',
      [issue(3), { issuedAt: 'x' }, null],
      NOW.getTime(),
      NOW.getTime() + HOUR,
    );
    expect((await loadOutlooks('lyon')).map((m) => m.issuedAt)).toEqual([issue(3).issuedAt]);
    await setDataset('outlooks', 'lyon', 'pas une liste', NOW.getTime(), NOW.getTime() + HOUR);
    expect(await loadOutlooks('lyon')).toEqual([]);
  });
});

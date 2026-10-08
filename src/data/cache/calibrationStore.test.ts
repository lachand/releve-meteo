import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JournalEntry } from '../../domain/journal';
import { loadCalibration, recordCalibration } from './calibrationStore';
import { resetMemoryDatasetStore, setDataset } from './datasetStore';
import { deleteDbForTests } from './db';
import { recordOutlook } from './outlookStore';

const NOW = new Date('2026-10-05T07:00:00Z');
const HOUR = 60 * 60 * 1000;

const ENTRY: JournalEntry = {
  date: '2026-10-04',
  stationName: 'Lyon / Bron',
  hours: 24,
  observedMin: 9,
  observedMax: 22,
  models: [],
};

beforeEach(async () => {
  resetMemoryDatasetStore();
  await deleteDbForTests();
});
afterEach(() => resetMemoryDatasetStore());

describe('calibrationStore', () => {
  it('rend rien pour un lieu sans jour verifie', async () => {
    expect(await loadCalibration('lyon')).toEqual([]);
  });

  it('n enregistre rien sans prevision gardee la veille : jamais une confiance devinee', async () => {
    expect(await recordCalibration('lyon', ENTRY, NOW)).toEqual([]);
    expect(await loadCalibration('lyon')).toEqual([]);
  });

  it('rapproche le jour de la prevision gardee la veille, et la garde par lieu', async () => {
    // Midi du 4 octobre a Paris : 10 h UTC. Prevision emise 24 h avant.
    const issuedAt = new Date('2026-10-04T10:00:00Z').getTime() - 24 * HOUR;
    await recordOutlook(
      'lyon',
      {
        issuedAt,
        days: [
          {
            date: '2026-10-04',
            model: 'arome',
            tempMax: 21,
            tempMin: 9,
            rain: 0,
            confidence: 'high',
          },
        ],
      },
      new Date(issuedAt),
    );
    const records = await recordCalibration('lyon', ENTRY, NOW);
    expect(records).toEqual([
      { date: '2026-10-04', level: 'high', error: 0.5, model: 'arome', issuedAt },
    ]);
    expect(await loadCalibration('lyon')).toEqual(records);
    expect(await loadCalibration('brest')).toEqual([]);
  });

  it('ecarte un enregistrement abime sans casser', async () => {
    await setDataset(
      'calibration',
      'lyon',
      [{ date: 'x' }, null],
      NOW.getTime(),
      NOW.getTime() + HOUR,
    );
    expect(await loadCalibration('lyon')).toEqual([]);
    await setDataset('calibration', 'lyon', 'pas une liste', NOW.getTime(), NOW.getTime() + HOUR);
    expect(await loadCalibration('lyon')).toEqual([]);
  });
});

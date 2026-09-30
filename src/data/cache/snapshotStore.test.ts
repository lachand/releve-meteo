import { beforeEach, describe, expect, it } from 'vitest';
import type { ForecastSnapshot } from '../../domain/leadScores';
import type { LocalIsoHour } from '../../domain/types';
import { deleteDbForTests } from './db';
import { getDataset, resetMemoryDatasetStore, setDataset } from './datasetStore';
import { loadSnapshots, recordSnapshot } from './snapshotStore';

const NOW = new Date('2026-09-28T08:12:00Z');

function snapshot(issuedAt: string, value: number): ForecastSnapshot {
  return {
    issuedAt: issuedAt as LocalIsoHour,
    timeline: ['2026-09-28T11:00' as LocalIsoHour],
    temperature: { arome: [value] },
  };
}

beforeEach(async () => {
  await deleteDbForTests();
  resetMemoryDatasetStore();
});

describe('snapshotStore', () => {
  it('ne rend rien pour une station sans instantane', async () => {
    expect(await loadSnapshots('07480')).toEqual([]);
  });

  it('enregistre un instantane par heure de relevee et les relit dans l ordre', async () => {
    await recordSnapshot('07480', snapshot('2026-09-28T09:00', 20), NOW);
    const all = await recordSnapshot('07480', snapshot('2026-09-28T08:00', 19), NOW);
    expect(all.map((s) => s.issuedAt)).toEqual(['2026-09-28T08:00', '2026-09-28T09:00']);
    expect(await loadSnapshots('07480')).toEqual(all);
  });

  it('remplace l instantane d une meme heure plutot que de l empiler', async () => {
    await recordSnapshot('07480', snapshot('2026-09-28T09:00', 20), NOW);
    const all = await recordSnapshot('07480', snapshot('2026-09-28T09:00', 22), NOW);
    expect(all).toHaveLength(1);
    expect(all[0]?.temperature.arome).toEqual([22]);
  });

  it('garde les instantanes de chaque station separes', async () => {
    await recordSnapshot('07480', snapshot('2026-09-28T09:00', 20), NOW);
    expect(await loadSnapshots('07481')).toEqual([]);
  });

  it('oublie les instantanes plus vieux que la retention', async () => {
    await recordSnapshot('07480', snapshot('2026-09-10T09:00', 5), NOW);
    const all = await recordSnapshot('07480', snapshot('2026-09-28T09:00', 20), NOW);
    expect(all.map((s) => s.issuedAt)).toEqual(['2026-09-28T09:00']);
  });

  it('ignore un contenu stocke illisible', async () => {
    await setDataset('snapshots', '07480', { not: 'a list' }, 0, NOW.getTime() + 1000);
    expect(await loadSnapshots('07480')).toEqual([]);
    const all = await recordSnapshot('07480', snapshot('2026-09-28T09:00', 20), NOW);
    expect(all).toHaveLength(1);
    expect((await getDataset('snapshots', '07480'))?.value).toEqual(all);
  });
});

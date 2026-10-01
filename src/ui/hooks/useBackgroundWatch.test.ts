import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import departments from '../../../public/data/departements-fr.json';
import { server } from '../../../tests/msw';
import { deleteDbForTests } from '../../data/cache/db';
import { resetMemoryDatasetStore } from '../../data/cache/datasetStore';
import { clearModelChoices, writeModelChoice } from '../../data/cache/modelChoice';
import { readWatchState, saveWatchEntries } from '../../data/cache/watchStore';
import { resetDepartmentsForTests } from '../../data/repository';
import type { AlertHit } from '../../domain/alerts';
import type { SpreadHit } from '../../domain/spreadAlerts';
import type { AlertRule, Place } from '../../domain/types';
import * as backgroundWatch from '../../pwa/backgroundWatch';
import { buildWatchEntries, useBackgroundWatch } from './useBackgroundWatch';
import type { WatchMirrorInputs } from './useBackgroundWatch';

vi.mock('../../pwa/backgroundWatch', () => ({
  readWatchStatus: vi.fn(),
  enableWatch: vi.fn(),
  disableWatch: vi.fn(),
  requestWatchRun: vi.fn(() => Promise.resolve()),
}));

const mocked = vi.mocked(backgroundWatch);

function place(id: string, name: string, latitude: number, longitude: number): Place {
  return { id, name, latitude, longitude, elevation: 100, admin: null, alias: null };
}

const LYON = place('lyon', 'Lyon', 45.7578, 4.832);
const BREST = place('brest', 'Brest', 48.3904, -4.4861);
const ANNECY = place('annecy', 'Annecy', 45.8992, 6.1294);

function rule(placeId: string, enabled = true): AlertRule {
  return {
    id: `r-${placeId}`,
    placeId,
    variable: 'temperature',
    comparator: 'gt',
    threshold: 25,
    enabled,
  };
}

const LYON_TERRAIN = { kind: 'plain', elevation: 170 } as unknown as WatchMirrorInputs['terrain'];

function inputs(overrides: Partial<WatchMirrorInputs> = {}): WatchMirrorInputs {
  return {
    place: LYON,
    terrain: LYON_TERRAIN,
    verification: [],
    preferred: 'arome',
    favourites: [BREST],
    rules: [rule('lyon'), rule('brest', false)],
    windUnit: 'kmh',
    alertHits: [],
    spreadHits: [],
    vigilance: null,
    ...overrides,
  };
}

beforeEach(async () => {
  await deleteDbForTests();
  resetMemoryDatasetStore();
  resetDepartmentsForTests();
  clearModelChoices();
  server.use(http.get('*/data/departements-fr.json', () => HttpResponse.json(departments)));
  mocked.readWatchStatus.mockResolvedValue('on');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('buildWatchEntries', () => {
  it('recopie favoris et lieux a regles, avec departement et intrants de cascade', async () => {
    writeModelChoice('brest', 'arpege');
    // Annecy vient d'une veille precedente et porte une regle active.
    await saveWatchEntries(
      [
        {
          place: ANNECY,
          department: null,
          rules: [],
          terrain: null,
          verification: [],
          preferred: null,
        },
      ],
      'kmh',
      new Date(),
    );
    const entries = await buildWatchEntries({
      ...inputs(),
      rules: [rule('lyon'), rule('brest', false), rule('annecy')],
    });
    expect(entries.map((e) => [e.place.id, e.department?.code, e.rules.map((r) => r.id)])).toEqual([
      ['brest', '29', []],
      ['lyon', '69', ['r-lyon']],
      ['annecy', '74', ['r-annecy']],
    ]);
    const [brest, lyon] = entries;
    // Lieu ouvert : ses propres intrants. Autres lieux : comme la carte des favoris.
    expect(lyon?.terrain).toBe(LYON_TERRAIN);
    expect(lyon?.preferred).toBe('arome');
    expect(brest?.preferred).toBe('arpege');
    expect(brest?.terrain?.kind).toBe('coastal');
  });
});

describe('useBackgroundWatch', () => {
  it('recopie les lieux et note comme vu ce que la page affiche, veille active', async () => {
    const hit: AlertHit = {
      rule: rule('lyon'),
      first: { time: '2026-09-28T16:00', value: 26, model: 'arome' },
      extreme: { time: '2026-09-28T16:00', value: 26, model: 'arome' },
      hours: 1,
    };
    const crossing = {
      time: '2026-09-28T18:00' as const,
      variable: 'temperature' as const,
      spread: 5,
      modelCount: 3,
      high: { model: 'arome' as const, value: 20 },
      low: { model: 'gfs' as const, value: 15 },
    };
    const spreadHit: SpreadHit = {
      rule: { ...rule('lyon'), id: 'e-lyon', kind: 'spread', threshold: 3 },
      first: crossing,
      extreme: crossing,
      hours: 1,
    };
    const { result } = renderHook(() =>
      useBackgroundWatch(
        inputs({
          alertHits: [hit],
          spreadHits: [spreadHit],
          vigilance: {
            department: '69',
            summary: {
              maxLevel: 3,
              stale: false,
              warnings: [
                { phenomenon: 'rain', level: 2, beginUtcMs: 1, endUtcMs: 2, coastal: false },
                {
                  phenomenon: 'thunderstorm',
                  level: 3,
                  beginUtcMs: 1,
                  endUtcMs: 2,
                  coastal: false,
                },
              ],
            },
          },
        }),
      ),
    );
    await waitFor(() => expect(result.current.status).toBe('on'));
    await waitFor(async () => expect((await readWatchState()).entries).toHaveLength(2));
    await waitFor(async () =>
      expect(Object.keys((await readWatchState()).notified).sort()).toEqual([
        'alerte|r-lyon|2026-09-28T16:00',
        'ecart|e-lyon|2026-09-28T18:00',
        'vigilance|69|thunderstorm|3|1|terre',
      ]),
    );
  });

  it('ne recopie rien veille eteinte, puis lance une premiere veille apres activation', async () => {
    mocked.readWatchStatus.mockResolvedValue('off');
    mocked.enableWatch.mockResolvedValue('on');
    const { result } = renderHook(() => useBackgroundWatch(inputs()));
    await waitFor(() => expect(result.current.status).toBe('off'));
    expect((await readWatchState()).entries).toEqual([]);

    mocked.readWatchStatus.mockResolvedValue('on');
    act(() => result.current.enable());
    await waitFor(() => expect(mocked.requestWatchRun).toHaveBeenCalledOnce());
    expect((await readWatchState()).entries.map((e) => e.place.id)).toEqual(['brest', 'lyon']);
    expect(result.current.busy).toBe(false);
  });

  it('garde le resume du matin voulu, relu a la prochaine ouverture', async () => {
    const { result, unmount } = renderHook(() => useBackgroundWatch(inputs()));
    await waitFor(() => expect(result.current.status).toBe('on'));
    expect(result.current.digest).toBe(false);
    act(() => result.current.setDigest(true));
    expect(result.current.digest).toBe(true);
    await waitFor(async () => expect((await readWatchState()).digest).toBe(true));
    unmount();

    const again = renderHook(() => useBackgroundWatch(inputs()));
    await waitFor(() => expect(again.result.current.digest).toBe(true));
  });

  it('arrete la veille', async () => {
    mocked.disableWatch.mockResolvedValue('off');
    const { result } = renderHook(() => useBackgroundWatch(inputs()));
    await waitFor(() => expect(result.current.status).toBe('on'));
    mocked.readWatchStatus.mockResolvedValue('off');
    act(() => result.current.disable());
    await waitFor(() => expect(result.current.status).toBe('off'));
    expect(mocked.requestWatchRun).not.toHaveBeenCalled();
  });
});

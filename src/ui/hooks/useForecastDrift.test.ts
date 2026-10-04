import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordOutlook } from '../../data/cache/outlookStore';
import { deleteDbForTests } from '../../data/cache/db';
import { resetMemoryDatasetStore } from '../../data/cache/datasetStore';
import type { DaySummary } from '../../domain/forecastDrift';
import { useForecastDrift } from './useForecastDrift';

const NOW = new Date('2026-10-03T19:30:00Z');
const HOUR = 60 * 60 * 1000;

function summaries(tempMax: number): readonly DaySummary[] {
  return [{ date: '2026-10-04', model: 'arome', tempMax, tempMin: 8, rain: 0, confidence: 'high' }];
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetMemoryDatasetStore();
  await deleteDbForTests();
});
afterEach(() => {
  vi.useRealTimers();
  resetMemoryDatasetStore();
});

describe('useForecastDrift', () => {
  it('reste idle sans prevision', () => {
    const { result } = renderHook(() => useForecastDrift(null, null, null));
    expect(result.current).toEqual({ status: 'idle' });
  });

  it('collecte au premier jour, puis compare a la prevision gardee la veille', async () => {
    const days = summaries(21);
    const first = renderHook(() => useForecastDrift('lyon', NOW.getTime(), days));
    await waitFor(() => expect(first.result.current.status).toBe('collecting'));

    await recordOutlook(
      'lyon',
      {
        issuedAt: NOW.getTime() - 24 * HOUR,
        days: [{ date: '2026-10-04', model: 'arome', tempMax: 18, tempMin: 8, rain: 0 }],
      },
      NOW,
    );
    const second = renderHook(() => useForecastDrift('lyon', NOW.getTime(), days));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    const state = second.result.current;
    if (state.status !== 'ready') {
      throw new Error('attendu : ready');
    }
    expect(state.drift.moved.map((d) => d.date)).toEqual(['2026-10-04']);
  });
});

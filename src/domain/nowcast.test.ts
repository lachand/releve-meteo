import { describe, expect, it } from 'vitest';
import { summarizeNowcast } from './nowcast';

// 14h07 locale le 17 aout 2026 (UTC+2).
const now = new Date('2026-08-17T12:07:00Z');
const times = [
  '2026-08-17T13:45',
  '2026-08-17T14:00',
  '2026-08-17T14:15',
  '2026-08-17T14:30',
  '2026-08-17T14:45',
];

describe('summarizeNowcast', () => {
  it('annonce le debut de la pluie et son intensite de pointe', () => {
    expect(summarizeNowcast(times, [0.5, 0, 0, 0.3, 0.8], now)).toEqual({
      kind: 'starting',
      inMinutes: 23,
      peakMm: 0.8,
    });
  });

  it('annonce la fin d une pluie en cours', () => {
    expect(summarizeNowcast(times, [0, 0.4, 0.6, 0, 0.2], now)).toEqual({
      kind: 'ongoing',
      stopsInMinutes: 23,
      peakMm: 0.6,
    });
  });

  it('ne promet pas de fin si la pluie dure tout l horizon', () => {
    expect(summarizeNowcast(times, [0, 0.4, 0.6, 0.3, 0.2], now)).toMatchObject({
      kind: 'ongoing',
      stopsInMinutes: null,
    });
  });

  it('annonce un horizon sec', () => {
    expect(summarizeNowcast(times, [1, 0, 0, 0.05, 0], now)).toEqual({
      kind: 'dry',
      horizonMinutes: 53,
    });
  });

  it('s arrete au premier trou plutot que de supposer le sec', () => {
    expect(summarizeNowcast(times, [0, 0, null, 2, 2], now)).toEqual({
      kind: 'dry',
      horizonMinutes: 15,
    });
    expect(summarizeNowcast(times, [0, null], now)).toEqual({ kind: 'unavailable' });
    expect(summarizeNowcast([], [], now)).toEqual({ kind: 'unavailable' });
  });
});

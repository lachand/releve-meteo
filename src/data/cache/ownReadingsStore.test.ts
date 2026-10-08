import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OwnReading } from '../../domain/ownReadings';
import {
  readOwnReadings,
  resetMemoryOwnReadingsForTests,
  writeOwnReadings,
} from './ownReadingsStore';

const READING: OwnReading = {
  placeId: 'lyon',
  date: '2026-10-03',
  tempMax: 20,
  tempMin: null,
  rain: 1.5,
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetMemoryOwnReadingsForTests();
});

describe('ownReadingsStore', () => {
  it('rend une liste vide sans saisie', () => {
    expect(readOwnReadings()).toEqual([]);
  });

  it('garde les saisies, valeurs absentes comprises, d une lecture a l autre', () => {
    writeOwnReadings([READING]);
    expect(readOwnReadings()).toEqual([READING]);
  });

  it('ecarte un enregistrement abime seul, jamais toute la liste', () => {
    localStorage.setItem(
      'meteo-fr:own-readings',
      JSON.stringify([READING, { placeId: 'x', date: 'hier' }, null]),
    );
    expect(readOwnReadings()).toEqual([READING]);
  });

  it('rend une liste vide sur un contenu illisible', () => {
    localStorage.setItem('meteo-fr:own-readings', '{pas du json');
    expect(readOwnReadings()).toEqual([]);
    localStorage.setItem('meteo-fr:own-readings', '{"a":1}');
    expect(readOwnReadings()).toEqual([]);
  });

  it('retombe sur la memoire quand le stockage refuse l ecriture', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    writeOwnReadings([READING]);
    expect(readOwnReadings()).toEqual([READING]);
  });
});

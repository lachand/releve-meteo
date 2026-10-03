import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../domain/types';
import { readLastPlace, resetMemoryLastPlaceForTests, writeLastPlace } from './lastPlace';

const VIRIEU: Place = {
  id: '45.4900:5.4700',
  name: 'Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

beforeEach(() => {
  localStorage.clear();
  resetMemoryLastPlaceForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lastPlace', () => {
  it('ne rend rien tant qu aucun lieu n a ete ouvert', () => {
    expect(readLastPlace()).toBeNull();
  });

  it('relit le lieu enregistre, alias compris', () => {
    writeLastPlace({ ...VIRIEU, alias: 'Chez nous' });
    expect(readLastPlace()).toEqual({ ...VIRIEU, alias: 'Chez nous' });
  });

  it('ne garde que le dernier lieu', () => {
    writeLastPlace(VIRIEU);
    writeLastPlace({ ...VIRIEU, id: '48.8566:2.3522', name: 'Paris' });
    expect(readLastPlace()?.name).toBe('Paris');
  });

  it.each([
    ['un JSON corrompu', '{oups'],
    ['autre chose qu un lieu', JSON.stringify({ name: 'Virieu' })],
    ['une latitude qui n est pas un nombre', JSON.stringify({ ...VIRIEU, latitude: 'x' })],
    ['une coordonnee infinie', JSON.stringify({ ...VIRIEU, longitude: null })],
    ['un nom vide', JSON.stringify({ ...VIRIEU, name: '' })],
  ])('ignore %s', (_label, raw) => {
    localStorage.setItem('meteo-fr:last-place', raw);
    expect(readLastPlace()).toBeNull();
  });

  it('retombe sur la memoire quand le stockage refuse l ecriture ou la lecture', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    writeLastPlace(VIRIEU);
    expect(readLastPlace()).toEqual(VIRIEU);
    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloque');
    });
    resetMemoryLastPlaceForTests();
    expect(readLastPlace()).toBeNull();
  });
});

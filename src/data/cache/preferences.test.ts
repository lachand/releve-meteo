import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Place } from '../../domain/types';
import {
  addFavourite,
  defaultPreferences,
  reorderFavourites,
  removeFavourite,
  readPreferences,
  resetMemoryPreferencesForTests,
  setAlias,
  setApiKey,
  setTheme,
  setWindUnit,
  writePreferences,
} from './preferences';

const virieu: Place = {
  id: '45.4840:5.4759',
  name: 'Virieu',
  latitude: 45.484,
  longitude: 5.4759,
  elevation: 415,
  admin: 'Isère',
  alias: null,
};

const golfeDuMorbihan: Place = {
  id: '47.5700:-2.8000',
  name: 'Golfe du Morbihan',
  latitude: 47.57,
  longitude: -2.8,
  elevation: 5,
  admin: 'Morbihan',
  alias: null,
};

beforeEach(() => {
  localStorage.clear();
  resetMemoryPreferencesForTests();
});

describe('readPreferences', () => {
  it('retourne les preferences par defaut sans entree stockee', () => {
    expect(readPreferences()).toEqual(defaultPreferences());
  });

  it('relit ce qui a ete ecrit', () => {
    const withFavourite = addFavourite(defaultPreferences(), virieu).preferences;
    writePreferences(withFavourite);
    expect(readPreferences()).toEqual(withFavourite);
  });

  it('retourne les defauts sur un JSON corrompu, sans planter', () => {
    localStorage.setItem('meteo-fr:prefs', '{not json');
    expect(readPreferences()).toEqual(defaultPreferences());
  });

  it('retourne les defauts sur une version inconnue', () => {
    localStorage.setItem('meteo-fr:prefs', JSON.stringify({ version: 2, favourites: [] }));
    expect(readPreferences()).toEqual(defaultPreferences());
  });
});

describe('addFavourite', () => {
  it('ajoute un lieu et signale le tout premier favori', () => {
    const result = addFavourite(defaultPreferences(), virieu);
    expect(result.preferences.favourites).toEqual([virieu]);
    expect(result.wasFirstFavourite).toBe(true);
  });

  it('ne signale pas premier favori pour un deuxieme lieu', () => {
    const afterFirst = addFavourite(defaultPreferences(), virieu).preferences;
    const result = addFavourite(afterFirst, golfeDuMorbihan);
    expect(result.preferences.favourites).toEqual([virieu, golfeDuMorbihan]);
    expect(result.wasFirstFavourite).toBe(false);
  });

  it('est idempotent sur un lieu deja favori', () => {
    const afterFirst = addFavourite(defaultPreferences(), virieu).preferences;
    const result = addFavourite(afterFirst, virieu);
    expect(result.preferences.favourites).toEqual([virieu]);
    expect(result.wasFirstFavourite).toBe(false);
  });
});

describe('removeFavourite', () => {
  it('retire un lieu par id', () => {
    const withTwo = addFavourite(
      addFavourite(defaultPreferences(), virieu).preferences,
      golfeDuMorbihan,
    ).preferences;
    const result = removeFavourite(withTwo, virieu.id);
    expect(result.favourites).toEqual([golfeDuMorbihan]);
  });
});

describe('reorderFavourites', () => {
  it('applique le nouvel ordre', () => {
    const withTwo = addFavourite(
      addFavourite(defaultPreferences(), virieu).preferences,
      golfeDuMorbihan,
    ).preferences;
    const result = reorderFavourites(withTwo, [golfeDuMorbihan.id, virieu.id]);
    expect(result.favourites).toEqual([golfeDuMorbihan, virieu]);
  });

  it('ignore un id inconnu', () => {
    const withOne = addFavourite(defaultPreferences(), virieu).preferences;
    const result = reorderFavourites(withOne, ['inconnu', virieu.id]);
    expect(result.favourites).toEqual([virieu]);
  });
});

describe('setAlias', () => {
  it('modifie uniquement le favori vise', () => {
    const withTwo = addFavourite(
      addFavourite(defaultPreferences(), virieu).preferences,
      golfeDuMorbihan,
    ).preferences;
    const result = setAlias(withTwo, virieu.id, 'Chez mamie');
    expect(result.favourites[0]?.alias).toBe('Chez mamie');
    expect(result.favourites[1]?.alias).toBeNull();
  });
});

describe('setWindUnit et setTheme', () => {
  it('changent uniquement le champ vise', () => {
    const base = defaultPreferences();
    const withKt = setWindUnit(base, 'kt');
    expect(withKt.units).toEqual({ temperature: 'C', wind: 'kt' });
    const withDark = setTheme(withKt, 'dark');
    expect(withDark.theme).toBe('dark');
    expect(withDark.units.wind).toBe('kt');
  });
});

describe('setApiKey', () => {
  it('stocke la cle sous la bonne entree sans toucher aux autres', () => {
    const result = setApiKey(defaultPreferences(), 'infoclimat', 'abc123');
    expect(result.apiKeys).toEqual({ vigilance: null, infoclimat: 'abc123' });
  });
});

describe('repli memoire quand localStorage est indisponible', () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    // @ts-expect-error simule un environnement sans localStorage (mode prive strict)
    delete globalThis.localStorage;
    resetMemoryPreferencesForTests();
  });

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
    resetMemoryPreferencesForTests();
  });

  it('reste fonctionnel sans localStorage', () => {
    const withFavourite = addFavourite(defaultPreferences(), virieu).preferences;
    writePreferences(withFavourite);
    expect(readPreferences()).toEqual(withFavourite);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AlertRule, Place } from '../../domain/types';
import {
  addAlert,
  addFavourite,
  defaultPreferences,
  reorderFavourites,
  removeFavourite,
  readPreferences,
  removeAlert,
  resetMemoryPreferencesForTests,
  setAlias,
  setApiKey,
  setPeakKwp,
  setQuickReading,
  setTheme,
  setWindUnit,
  toggleAlert,
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

describe('alertes', () => {
  const frost: AlertRule = {
    id: 'gel',
    placeId: virieu.id,
    variable: 'temperature',
    comparator: 'lt',
    threshold: 2,
    enabled: true,
  };

  it('ajoute, desactive puis retire une regle', () => {
    const added = addAlert(defaultPreferences(), frost);
    expect(added.alerts).toEqual([frost]);
    const toggled = toggleAlert(added, 'gel');
    expect(toggled.alerts[0]?.enabled).toBe(false);
    expect(removeAlert(toggled, 'gel').alerts).toEqual([]);
  });

  it('relit les regles enregistrees et ecarte une regle mal formee', () => {
    const stored = {
      ...defaultPreferences(),
      alerts: [frost, { id: 'x', placeId: virieu.id, variable: 'neige', comparator: 'gt' }],
    };
    localStorage.setItem('meteo-fr:prefs', JSON.stringify(stored));
    expect(readPreferences().alerts).toEqual([frost]);
  });

  it('relit une regle d ecart entre modeles, et ecarte un type inconnu', () => {
    const spread: AlertRule = { ...frost, id: 'ecart', comparator: 'gt', kind: 'spread' };
    const value: AlertRule = { ...frost, id: 'valeur', kind: 'value' };
    const stored = {
      ...defaultPreferences(),
      alerts: [frost, spread, value, { ...frost, id: 'inconnu', kind: 'autre' }],
    };
    localStorage.setItem('meteo-fr:prefs', JSON.stringify(stored));
    // Une regle sans `kind` (enregistree avant l'alerte d'ecart) reste une regle de valeur.
    expect(readPreferences().alerts).toEqual([frost, spread, value]);
  });

  it('relit une regle en probabilite, et ecarte un pourcentage absent ou hors de 1 a 100', () => {
    const proba: AlertRule = { ...frost, id: 'proba', kind: 'probability', probability: 40 };
    const stored = {
      ...defaultPreferences(),
      alerts: [
        proba,
        { ...proba, id: 'sans', probability: undefined },
        { ...proba, id: 'zero', probability: 0 },
        { ...proba, id: 'trop', probability: 101 },
        { ...proba, id: 'texte', probability: '40' },
      ],
    };
    localStorage.setItem('meteo-fr:prefs', JSON.stringify(stored));
    expect(readPreferences().alerts).toEqual([proba]);
  });

  it('relit une regle d air, de pollens ou d UV, et ecarte une grandeur ou un sens invalide', () => {
    const air: AlertRule = {
      id: 'uv',
      kind: 'air',
      placeId: virieu.id,
      variable: 'uv',
      comparator: 'gt',
      threshold: 7,
      enabled: true,
    };
    const stored = {
      ...defaultPreferences(),
      alerts: [
        air,
        // Un UV « sous » un seuil n'existe pas ; ni une temperature rangee parmi les regles d'air.
        { ...air, id: 'sous', comparator: 'lt' },
        { ...air, id: 'autre', variable: 'temperature' },
        // Et une grandeur d'air sur une regle de valeur est refusee.
        { ...frost, id: 'melange', variable: 'pollen' },
      ],
    };
    localStorage.setItem('meteo-fr:prefs', JSON.stringify(stored));
    expect(readPreferences().alerts).toEqual([air]);
  });

  it('vaut une liste vide quand le champ manque dans un enregistrement ancien', () => {
    const { alerts: _omitted, ...withoutAlerts } = defaultPreferences();
    localStorage.setItem('meteo-fr:prefs', JSON.stringify(withoutAlerts));
    expect(readPreferences().alerts).toEqual([]);
  });
});

describe('setPeakKwp', () => {
  it('enregistre une puissance crete valide, arrondie au dixieme', () => {
    expect(setPeakKwp(defaultPreferences(), 3.04).solar).toEqual({ peakKwp: 3 });
    expect(setPeakKwp(defaultPreferences(), 6.26).solar).toEqual({ peakKwp: 6.3 });
  });

  it('retombe a null pour une valeur absente, nulle, negative, infinie ou demesuree', () => {
    const base = setPeakKwp(defaultPreferences(), 3);
    for (const invalid of [null, 0, -2, Number.NaN, Number.POSITIVE_INFINITY, 101]) {
      expect(setPeakKwp(base, invalid).solar).toEqual({ peakKwp: null });
    }
  });

  it('ne touche a aucun autre champ', () => {
    const base = setTheme(defaultPreferences(), 'dark');
    expect(setPeakKwp(base, 3).theme).toBe('dark');
  });
});

describe('readPreferences, puissance crete', () => {
  it('ecarte une puissance illisible ou une section solaire absente', () => {
    const stored = { ...defaultPreferences(), solar: { peakKwp: 'beaucoup' } };
    localStorage.setItem('meteo-fr:prefs', JSON.stringify(stored));
    expect(readPreferences().solar).toEqual({ peakKwp: null });
    const { solar: _solar, ...withoutSolar } = defaultPreferences();
    localStorage.setItem('meteo-fr:prefs', JSON.stringify(withoutSolar));
    expect(readPreferences().solar).toEqual({ peakKwp: null });
    localStorage.setItem(
      'meteo-fr:prefs',
      JSON.stringify({ ...defaultPreferences(), solar: { peakKwp: 4.5 } }),
    );
    expect(readPreferences().solar).toEqual({ peakKwp: 4.5 });
  });
});

describe('lecture rapide', () => {
  it('est desactivee par defaut, et se regle sans toucher au reste', () => {
    expect(defaultPreferences().display).toEqual({ quick: false });
    const quick = setQuickReading(setTheme(defaultPreferences(), 'dark'), true);
    expect(quick.display.quick).toBe(true);
    expect(quick.theme).toBe('dark');
    expect(setQuickReading(quick, false).display.quick).toBe(false);
  });

  it('se relit, et vaut lecture complete pour un enregistrement ancien ou illisible', () => {
    localStorage.setItem(
      'meteo-fr:prefs',
      JSON.stringify(setQuickReading(defaultPreferences(), true)),
    );
    expect(readPreferences().display.quick).toBe(true);
    const { display: _omitted, ...old } = defaultPreferences();
    localStorage.setItem('meteo-fr:prefs', JSON.stringify(old));
    expect(readPreferences().display.quick).toBe(false);
    localStorage.setItem('meteo-fr:prefs', JSON.stringify({ ...old, display: { quick: 'oui' } }));
    expect(readPreferences().display.quick).toBe(false);
  });
});

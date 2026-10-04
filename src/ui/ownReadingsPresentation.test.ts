import { describe, expect, it } from 'vitest';
import type { ModelComparison, ReadingsComparison } from '../domain/ownReadings';
import {
  READING_PROBLEMS,
  comparisonHeadline,
  modelLine,
  predictionText,
  readingText,
  valuesText,
} from './ownReadingsPresentation';

const NBSP = ' ';

function comparison(overrides: Partial<ReadingsComparison> = {}): ReadingsComparison {
  return { days: [], models: [], compared: 0, skipped: 0, ...overrides };
}

const arome: ModelComparison = {
  model: 'arome',
  temperature: { values: 6, mae: 0.8, bias: 0.3 },
  rain: { values: 3, mae: 1.2, bias: -1.2 },
};

describe('valuesText', () => {
  it('ecrit maximum, minimum et pluie, un champ absent par un tiret, tout absent par un tiret seul', () => {
    expect(valuesText({ tempMax: 21, tempMin: 9, rain: 2.44 })).toBe(
      `21 / 9${NBSP}°C · 2,4${NBSP}mm`,
    );
    expect(valuesText({ tempMax: 21, tempMin: null, rain: null })).toBe(`21 / –${NBSP}°C`);
    expect(valuesText({ tempMax: null, tempMin: null, rain: 0 })).toBe(`0${NBSP}mm`);
    expect(valuesText({ tempMax: null, tempMin: null, rain: null })).toBe('–');
    expect(
      readingText({ placeId: 'a', date: '2026-10-03', tempMax: 1, tempMin: 0, rain: null }),
    ).toBe(`1 / 0${NBSP}°C`);
    expect(predictionText({ tempMax: null, tempMin: null, rain: 3 })).toBe(`3${NBSP}mm`);
  });
});

describe('modelLine', () => {
  it('dit l ecart du thermometre et du pluviometre, avec le sens de l ecart', () => {
    expect(modelLine(arome)).toBe(
      `AROME : thermomètre 0,8${NBSP}°C d’écart moyen (0,3${NBSP}°C trop haut en moyenne) sur 6${NBSP}valeurs ; pluviomètre 1,2${NBSP}mm d’écart moyen (1,2${NBSP}mm de moins en moyenne) sur 3${NBSP}valeurs`,
    );
  });

  it('dit sans ecart moyen quand le biais s annule, et omet un instrument sans valeur', () => {
    expect(modelLine({ ...arome, temperature: { values: 1, mae: 1, bias: 0 }, rain: null })).toBe(
      `AROME : thermomètre 1,0${NBSP}°C d’écart moyen (sans écart moyen) sur 1${NBSP}valeur`,
    );
  });
});

describe('comparisonHeadline', () => {
  it('dit pourquoi rien n est comparable', () => {
    expect(comparisonHeadline(comparison())).toContain(
      'Aucune de vos saisies n’est encore comparable',
    );
  });

  it('nomme le plus proche de votre thermometre et les suivants', () => {
    const result = comparison({
      compared: 3,
      models: [
        arome,
        { model: 'gfs', temperature: { values: 6, mae: 2.1, bias: -2.1 }, rain: null },
      ],
    });
    expect(comparisonHeadline(result)).toBe(
      `Sur 3${NBSP}jours de votre relevé, AROME a été le plus proche de votre thermomètre (0,8${NBSP}°C d’écart moyen), puis GFS 2,1${NBSP}°C.`,
    );
  });

  it('dit quand seule la pluie a pu etre comparee', () => {
    const result = comparison({
      compared: 1,
      models: [{ model: 'arome', temperature: null, rain: { values: 1, mae: 1, bias: 1 } }],
    });
    expect(comparisonHeadline(result)).toContain('seule la pluie l’a été');
  });
});

describe('READING_PROBLEMS', () => {
  it('dit chaque refus, en francais, sans tiret cadratin', () => {
    for (const text of Object.values(READING_PROBLEMS)) {
      expect(text).not.toContain('—');
      expect(text.length).toBeGreaterThan(10);
    }
  });
});

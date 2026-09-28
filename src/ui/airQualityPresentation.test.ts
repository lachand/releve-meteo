import { describe, expect, it } from 'vitest';
import type { AirQualitySeries } from '../data/clients/airQuality';
import { airQualityIndexAt, aqiLabel, dailyMax, pollenLevel } from './airQualityPresentation';

function buildSeries(timeline: readonly string[]): AirQualitySeries {
  const nulls = timeline.map(() => null);
  return {
    timeline,
    europeanAqi: nulls,
    pm2_5: nulls,
    pm10: nulls,
    ozone: nulls,
    nitrogenDioxide: nulls,
    uvIndex: nulls,
    pollen: {
      alder: nulls,
      birch: nulls,
      grass: nulls,
      mugwort: nulls,
      olive: nulls,
      ragweed: nulls,
    },
  };
}

describe('aqiLabel', () => {
  it('classe une valeur dans chaque tranche, borne haute incluse', () => {
    expect(aqiLabel(0)).toBe('Bon');
    expect(aqiLabel(20)).toBe('Bon');
    expect(aqiLabel(20.1)).toBe('Correct');
    expect(aqiLabel(60)).toBe('Moyen');
    expect(aqiLabel(80)).toBe('Médiocre');
    expect(aqiLabel(100)).toBe('Très mauvais');
    expect(aqiLabel(150)).toBe('Extrêmement mauvais');
  });

  it('retourne null pour une valeur absente', () => {
    expect(aqiLabel(null)).toBeNull();
  });
});

describe('pollenLevel', () => {
  it('classe une concentration en quatre niveaux', () => {
    expect(pollenLevel(0.5)).toBe('nul');
    expect(pollenLevel(1)).toBe('faible');
    expect(pollenLevel(19.9)).toBe('faible');
    expect(pollenLevel(20)).toBe('moyen');
    expect(pollenLevel(79.9)).toBe('moyen');
    expect(pollenLevel(80)).toBe('élevé');
  });

  it('retourne null pour une valeur absente', () => {
    expect(pollenLevel(null)).toBeNull();
  });
});

describe('airQualityIndexAt', () => {
  it('retourne l index de l heure demandee', () => {
    const series = buildSeries(['2026-08-17T13:00', '2026-08-17T14:00', '2026-08-17T15:00']);
    expect(airQualityIndexAt(series, '2026-08-17T14:00')).toBe(1);
  });

  it('retourne -1 quand l heure est absente de la serie', () => {
    const series = buildSeries(['2026-08-17T13:00']);
    expect(airQualityIndexAt(series, '2026-08-17T20:00')).toBe(-1);
  });
});

describe('dailyMax', () => {
  it('retourne le maximum des valeurs de la date demandee, en ignorant les null', () => {
    const series = buildSeries([
      '2026-08-17T22:00',
      '2026-08-18T08:00',
      '2026-08-18T14:00',
      '2026-08-19T08:00',
    ]);
    const values = [99, 3, null, 50];
    expect(dailyMax(series, values, '2026-08-18')).toBe(3);
  });

  it('retourne null quand aucune valeur connue ne tombe sur la date', () => {
    const series = buildSeries(['2026-08-18T08:00', '2026-08-18T14:00']);
    expect(dailyMax(series, [null, null], '2026-08-18')).toBeNull();
  });

  it('retourne null quand la date n apparait pas dans la serie', () => {
    const series = buildSeries(['2026-08-18T08:00']);
    expect(dailyMax(series, [5], '2026-09-01')).toBeNull();
  });
});

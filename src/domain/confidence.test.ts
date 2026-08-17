import { describe, expect, it } from 'vitest';
import { confidenceAt, dispersionAt, gradeDispersion, spreadBand } from './confidence';
import type { ForecastBundle, HourlyPoint, ModelId, Place, TerrainProfile } from './types';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

const plain: TerrainProfile = { kind: 'plain', elevation: 200, distanceToCoastKm: 100 };
const coastal: TerrainProfile = { kind: 'coastal', elevation: 5, distanceToCoastKm: 2 };
const mountain: TerrainProfile = { kind: 'mountain', elevation: 1200, distanceToCoastKm: 150 };

function measure(value: number | null) {
  return { value, provenance: 'forecast' as const };
}

function point(overrides: Partial<HourlyPoint> = {}): HourlyPoint {
  return {
    time: '2026-08-17T14:00',
    temperature: measure(14),
    precipitation: measure(0),
    windSpeed: measure(10),
    windGust: measure(20),
    windDirection: measure(180),
    pressure: measure(1013),
    dewPoint: measure(8),
    cloudCover: measure(50),
    radiation: measure(200),
    weatherCode: 1,
    ...overrides,
  };
}

function bundleWith(series: Partial<Record<ModelId, HourlyPoint>>): ForecastBundle {
  const timeline = ['2026-08-17T14:00'];
  const result: ForecastBundle = {
    place,
    fetchedAt: 0,
    timeline,
    series: {},
  };
  const mutableSeries: Record<string, { model: ModelId; hourly: HourlyPoint[]; daily: [] }> = {};
  for (const [model, p] of Object.entries(series)) {
    mutableSeries[model] = { model: model as ModelId, hourly: [p as HourlyPoint], daily: [] };
  }
  return { ...result, series: mutableSeries };
}

describe('dispersionAt', () => {
  it('retourne null avec un seul modele ayant une valeur', () => {
    const bundle = bundleWith({ arome: point({ temperature: measure(14) }) });
    expect(dispersionAt(bundle, 0, 'temperature')).toBeNull();
  });

  it('retourne null sans aucun modele ayant une valeur, sans exception', () => {
    const bundle = bundleWith({});
    expect(dispersionAt(bundle, 0, 'temperature')).toBeNull();
  });

  it('calcule un ecart max-min pour la temperature', () => {
    const bundle = bundleWith({
      arome: point({ temperature: measure(14) }),
      arpege: point({ temperature: measure(15.4) }),
    });
    const dispersion = dispersionAt(bundle, 0, 'temperature');
    expect(dispersion?.spread).toBeCloseTo(1.4, 5);
    expect(dispersion?.modelCount).toBe(2);
  });

  it('calcule un coefficient de variation pour les precipitations', () => {
    const bundle = bundleWith({
      arome: point({ precipitation: measure(1) }),
      arpege: point({ precipitation: measure(3) }),
    });
    const dispersion = dispersionAt(bundle, 0, 'precipitation');
    expect(dispersion?.spread).toBeGreaterThan(0);
  });

  it('retourne spread 0 (pas NaN) quand tous les modeles annoncent 0 mm', () => {
    const bundle = bundleWith({
      arome: point({ precipitation: measure(0) }),
      arpege: point({ precipitation: measure(0) }),
      icon_eu: point({ precipitation: measure(0) }),
    });
    const dispersion = dispersionAt(bundle, 0, 'precipitation');
    expect(dispersion?.spread).toBe(0);
    expect(Number.isNaN(dispersion?.spread)).toBe(false);
  });

  it('ignore les modeles dont la valeur est null a cet index', () => {
    const bundle = bundleWith({
      arome: point({ temperature: measure(14) }),
      arpege: point({ temperature: measure(null) }),
      icon_eu: point({ temperature: measure(16) }),
    });
    const dispersion = dispersionAt(bundle, 0, 'temperature');
    expect(dispersion?.modelCount).toBe(2);
    expect(dispersion?.spread).toBeCloseTo(2, 5);
  });
});

describe('gradeDispersion', () => {
  const grade = (spread: number, terrain: TerrainProfile = plain) =>
    gradeDispersion({ variable: 'temperature', spread, modelCount: 2 }, terrain);

  it('classe high en dessous de 1,5', () => {
    expect(grade(1.4)).toBe('high');
  });

  it('classe medium a 1,5 exactement (borne basse inclusive)', () => {
    expect(grade(1.5)).toBe('medium');
  });

  it('classe medium a 3,5 exactement', () => {
    expect(grade(3.5)).toBe('medium');
  });

  it('classe low au-dela de 3,5', () => {
    expect(grade(3.6)).toBe('low');
  });

  it('degrade le vent en zone cotiere', () => {
    const wind = gradeDispersion({ variable: 'wind', spread: 3, modelCount: 2 }, coastal);
    expect(wind).toBe('medium');
  });

  it('ne degrade pas la temperature en zone cotiere', () => {
    const temp = gradeDispersion({ variable: 'temperature', spread: 1, modelCount: 2 }, coastal);
    expect(temp).toBe('high');
  });

  it('degrade temperature et precipitations en montagne, pas le vent', () => {
    expect(gradeDispersion({ variable: 'temperature', spread: 1, modelCount: 2 }, mountain)).toBe(
      'medium',
    );
    expect(
      gradeDispersion({ variable: 'precipitation', spread: 0.1, modelCount: 2 }, mountain),
    ).toBe('medium');
    expect(gradeDispersion({ variable: 'wind', spread: 3, modelCount: 2 }, mountain)).toBe('high');
  });

  it('une penalite appliquee a low reste low, ne devient pas unavailable', () => {
    expect(gradeDispersion({ variable: 'wind', spread: 30, modelCount: 2 }, coastal)).toBe('low');
  });
});

describe('confidenceAt', () => {
  it('retourne unavailable avec un seul modele disponible sur toutes les variables', () => {
    const bundle = bundleWith({ arome: point() });
    expect(confidenceAt(bundle, 0, plain).level).toBe('unavailable');
  });

  it('retourne unavailable sans aucun modele, sans exception', () => {
    const bundle = bundleWith({});
    expect(confidenceAt(bundle, 0, plain).level).toBe('unavailable');
  });

  it('le verdict est le minimum des niveaux (temperature high, vent low -> low)', () => {
    const bundle = bundleWith({
      arome: point({ temperature: measure(14), windSpeed: measure(10) }),
      arpege: point({ temperature: measure(14.5), windSpeed: measure(40) }),
    });
    expect(confidenceAt(bundle, 0, plain).level).toBe('low');
  });

  it('le verdict est high quand temperature et vent sont high', () => {
    const bundle = bundleWith({
      arome: point({ temperature: measure(14), windSpeed: measure(10) }),
      arpege: point({ temperature: measure(14.5), windSpeed: measure(11) }),
    });
    expect(confidenceAt(bundle, 0, plain).level).toBe('high');
  });

  it('drivers contient exactement les variables au niveau minimum', () => {
    const bundle = bundleWith({
      arome: point({ temperature: measure(14), windSpeed: measure(10), precipitation: measure(0) }),
      arpege: point({
        temperature: measure(20),
        windSpeed: measure(40),
        precipitation: measure(0),
      }),
    });
    const verdict = confidenceAt(bundle, 0, plain);
    expect(verdict.drivers).toEqual(['temperature', 'wind']);
  });

  it("n'est pas unavailable si une seule variable manque de modeles, le verdict porte sur le reste", () => {
    const bundle = bundleWith({
      arome: point({ temperature: measure(14), windSpeed: measure(10) }),
      arpege: point({ temperature: measure(14.2), windSpeed: measure(null) }),
    });
    const verdict = confidenceAt(bundle, 0, plain);
    expect(verdict.level).toBe('high');
    expect(verdict.byVariable.wind).toBeUndefined();
  });
});

describe('spreadBand', () => {
  it('calcule min et max en ignorant un modele a null', () => {
    const bundle = bundleWith({
      arome: point({ temperature: measure(14) }),
      arpege: point({ temperature: measure(null) }),
      icon_eu: point({ temperature: measure(16) }),
    });
    const band = spreadBand(bundle, 'temperature');
    expect(band).toEqual([{ min: 14, max: 16 }]);
  });

  it('retourne min et max null quand tous les modeles sont a null', () => {
    const bundle = bundleWith({ arome: point({ temperature: measure(null) }) });
    const band = spreadBand(bundle, 'temperature');
    expect(band).toEqual([{ min: null, max: null }]);
  });
});

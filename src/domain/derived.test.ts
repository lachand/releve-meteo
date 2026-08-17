import { describe, expect, it } from 'vitest';
import { dewPoint, fogRisk, frostRisk, rollingSum, solarYieldKwh } from './derived';

describe('dewPoint', () => {
  it('calcule 9,3 °C a 20 °C et 50 % HR, tolerance 0,1', () => {
    expect(dewPoint(20, 50)).toBeCloseTo(9.3, 1);
  });

  it('calcule 0 °C a 0 °C et 100 % HR', () => {
    expect(dewPoint(0, 100)).toBeCloseTo(0, 1);
  });
});

describe('frostRisk', () => {
  it('est likely a -1 °C', () => {
    expect(frostRisk(-1)).toBe('likely');
  });

  it('est likely a 0 °C', () => {
    expect(frostRisk(0)).toBe('likely');
  });

  it('est possible a 1,9 °C', () => {
    expect(frostRisk(1.9)).toBe('possible');
  });

  it('est none a 2,1 °C', () => {
    expect(frostRisk(2.1)).toBe('none');
  });

  it('est none sans mesure', () => {
    expect(frostRisk(null)).toBe('none');
  });
});

describe('fogRisk', () => {
  it('est likely avec un ecart de 0,5 °C et un vent de 4 km/h', () => {
    expect(fogRisk({ temperatureC: 10, dewPointC: 9.5, windSpeedKmh: 4 })).toBe('likely');
  });

  it('est none avec un ecart de 0,5 °C mais un vent de 20 km/h', () => {
    expect(fogRisk({ temperatureC: 10, dewPointC: 9.5, windSpeedKmh: 20 })).toBe('none');
  });

  it('est possible avec un ecart et un vent intermediaires', () => {
    expect(fogRisk({ temperatureC: 10, dewPointC: 8, windSpeedKmh: 10 })).toBe('possible');
  });
});

describe('rollingSum', () => {
  it('ignore les null sans les compter comme 0 (dernier point sur une fenetre de 3)', () => {
    const result = rollingSum([1, null, 2], 3);
    expect(result).toHaveLength(3);
    expect(result[2]).toBe(3);
  });

  it('retourne null, pas 0, quand la fenetre est entierement null', () => {
    const result = rollingSum([null, null], 2);
    expect(result).toEqual([null, null]);
  });

  it('etend la fenetre au debut de la serie plutot que de retourner null immediatement', () => {
    const result = rollingSum([5, 5, 5], 3);
    expect(result).toEqual([5, 10, 15]);
  });
});

describe('solarYieldKwh', () => {
  it("est d'un ordre de grandeur coherent et non nul pour une journee type a 3 kWc", () => {
    // Insolation type d'une journee d'ete en France, W/m2 par heure, 6h-20h.
    const hourly = [0, 0, 50, 200, 400, 600, 750, 800, 750, 600, 400, 200, 50, 0, 0];
    const yieldKwh = solarYieldKwh(hourly, 3);
    expect(yieldKwh).toBeGreaterThan(1);
    expect(yieldKwh).toBeLessThan(30);
  });

  it('retourne 0 sans exception quand la radiation est entierement null', () => {
    expect(solarYieldKwh([null, null, null], 3)).toBe(0);
  });

  it('applique systemLoss par defaut a 0,20', () => {
    const withDefault = solarYieldKwh([1000], 1);
    const withZeroLoss = solarYieldKwh([1000], 1, 0);
    expect(withDefault).toBeCloseTo(withZeroLoss * 0.8, 5);
  });
});

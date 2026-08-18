import { describe, expect, it } from 'vitest';
import { convertWindSpeed, windUnitLabel } from './windUnit';

describe('convertWindSpeed', () => {
  it('laisse la valeur inchangee en km/h', () => {
    expect(convertWindSpeed(18.52, 'kmh')).toBe(18.52);
  });

  it('convertit vers les noeuds', () => {
    expect(convertWindSpeed(18.52, 'kt')).toBeCloseTo(10, 5);
  });

  it('laisse null tel quel, jamais 0', () => {
    expect(convertWindSpeed(null, 'kt')).toBeNull();
  });
});

describe('windUnitLabel', () => {
  it('retourne le libelle correspondant', () => {
    expect(windUnitLabel('kmh')).toBe('km/h');
    expect(windUnitLabel('kt')).toBe('kt');
  });
});

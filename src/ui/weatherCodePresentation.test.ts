import { describe, expect, it } from 'vitest';
import { weatherCodeLabel } from './weatherCodePresentation';

describe('weatherCodeLabel', () => {
  it('traduit un code connu', () => {
    expect(weatherCodeLabel(0)).toBe('Ciel dégagé');
    expect(weatherCodeLabel(63)).toBe('Pluie');
    expect(weatherCodeLabel(95)).toBe('Orage');
    expect(weatherCodeLabel(96)).toBe('Orage avec grêle');
  });

  it('retourne null pour un code absent, jamais un texte par defaut trompeur', () => {
    expect(weatherCodeLabel(null)).toBeNull();
  });

  it('retourne null pour un code inconnu plutot que planter', () => {
    expect(weatherCodeLabel(12345)).toBeNull();
  });
});

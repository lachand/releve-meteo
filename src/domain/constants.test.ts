import { describe, expect, it } from 'vitest';
import {
  CASCADE_BOUNDS_HOURS,
  CACHE_TTL_MS,
  CONFIDENCE_THRESHOLDS,
  RELIABILITY,
  TERRAIN_PENALTIES,
  TERRAIN_THRESHOLDS,
} from './constants';

describe('constants', () => {
  it('borne la cascade de modeles sur 36 / 96 / 168 h', () => {
    expect(CASCADE_BOUNDS_HOURS).toEqual({ aromeMax: 36, arpegeMax: 96, mediumRangeMax: 168 });
  });

  it('fixe les seuils de terrain', () => {
    expect(TERRAIN_THRESHOLDS).toEqual({
      mountainElevationM: 900,
      plateauElevationM: 300,
      coastalDistanceKm: 10,
    });
  });

  it('fixe les seuils de confiance par variable', () => {
    expect(CONFIDENCE_THRESHOLDS.temperature).toEqual({ high: 1.5, medium: 3.5 });
    expect(CONFIDENCE_THRESHOLDS.wind).toEqual({ high: 8, medium: 18 });
    expect(CONFIDENCE_THRESHOLDS.precipitation).toEqual({ high: 0.3, medium: 0.7 });
  });

  it('ne penalise que le vent en zone cotiere', () => {
    expect(TERRAIN_PENALTIES.coastal).toEqual(['wind']);
    expect(TERRAIN_PENALTIES.plain).toEqual([]);
  });

  it('fixe la retention de fiabilite a 90 jours et 10 echantillons minimum', () => {
    expect(RELIABILITY).toEqual({ retentionDays: 90, minSamples: 10 });
  });

  it('exprime les TTL de cache en millisecondes', () => {
    expect(CACHE_TTL_MS.forecast).toBe(60 * 60 * 1000);
    expect(CACHE_TTL_MS.vigilance).toBe(15 * 60 * 1000);
  });
});

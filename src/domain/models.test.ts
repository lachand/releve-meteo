import { describe, expect, it } from 'vitest';
import { MODEL_ORDER, MODEL_SPECS, coversLocation, sortModels, terrainFit } from './models';

describe('MODEL_SPECS', () => {
  it('decrit chaque modele avec des forces et des faiblesses non vides', () => {
    for (const spec of Object.values(MODEL_SPECS)) {
      expect(spec.strengths.length).toBeGreaterThan(0);
      expect(spec.weaknesses.length).toBeGreaterThan(0);
      expect(spec.maxLeadHours).toBeGreaterThan(0);
    }
  });

  it("n'utilise aucun em dash dans les textes", () => {
    for (const spec of Object.values(MODEL_SPECS)) {
      for (const text of [...spec.strengths, ...spec.weaknesses]) {
        expect(text).not.toContain(String.fromCharCode(0x2014));
      }
    }
  });
});

describe('MODEL_ORDER', () => {
  it('va du plus fin au plus large', () => {
    expect(MODEL_ORDER[0]).toBe('arome');
    expect(MODEL_ORDER.at(-1)).toBe('gfs');
    expect(MODEL_ORDER).toHaveLength(7);
  });
});

describe('sortModels', () => {
  it('trie une liste quelconque selon la finesse', () => {
    expect(sortModels(['gfs', 'arome', 'ecmwf'])).toEqual(['arome', 'ecmwf', 'gfs']);
  });
});

describe('coversLocation', () => {
  it('ICON-D2 couvre Strasbourg mais pas Brest ni Ajaccio', () => {
    expect(coversLocation('icon_d2', 48.58, 7.75)).toBe(true);
    expect(coversLocation('icon_d2', 48.39, -4.49)).toBe(false);
    expect(coversLocation('icon_d2', 41.93, 8.74)).toBe(false);
  });

  it('ICON-D2 exclut les bords nord et est de son emprise', () => {
    expect(coversLocation('icon_d2', 58, 10)).toBe(false);
    expect(coversLocation('icon_d2', 50, 20)).toBe(false);
  });

  it('les modeles France, Europe et globaux couvrent toute la metropole', () => {
    expect(coversLocation('arome', 48.39, -4.49)).toBe(true);
    expect(coversLocation('arpege', 41.93, 8.74)).toBe(true);
    expect(coversLocation('gfs', 50.95, 1.85)).toBe(true);
  });
});

describe('terrainFit', () => {
  it('favorise la maille fine, davantage en montagne qu en plaine', () => {
    const aromeMountain = terrainFit('arome', 'mountain');
    const gfsMountain = terrainFit('gfs', 'mountain');
    const gfsPlain = terrainFit('gfs', 'plain');
    expect(aromeMountain).toBeGreaterThan(gfsMountain);
    expect(gfsPlain).toBeGreaterThan(gfsMountain);
  });

  it('reste borne dans [0, 1]', () => {
    for (const model of MODEL_ORDER) {
      for (const terrain of ['mountain', 'coastal', 'plateau', 'plain'] as const) {
        const fit = terrainFit(model, terrain);
        expect(fit).toBeGreaterThanOrEqual(0);
        expect(fit).toBeLessThanOrEqual(1);
      }
    }
  });
});

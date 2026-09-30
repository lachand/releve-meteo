import { describe, expect, it } from 'vitest';
import { buildBundle, buildHourlyTimeline } from '../../tests/factories';
import { briefingAt } from './briefing';
import type { ConfidenceVerdict } from './confidence';
import type { ModelId } from './types';

const TIMELINE = buildHourlyTimeline('2026-09-28T00:00', 4);

const HIGH: ConfidenceVerdict = {
  level: 'high',
  byVariable: { temperature: 'high' },
  drivers: ['temperature'],
  modelCount: 4,
};

function bundleWith(temperatures: Partial<Record<ModelId, number | null>>) {
  const models = Object.keys(temperatures) as ModelId[];
  return buildBundle({
    timeline: TIMELINE,
    models,
    values: (model) => ({ temperature: temperatures[model] ?? null }),
  });
}

describe('briefingAt', () => {
  it('rend la valeur du modele retenu et l ecart moyen et maximal des autres', () => {
    const briefing = briefingAt({
      bundle: bundleWith({ arome: 14, gfs: 14.6, ecmwf: 13.4, arpege: 15.4 }),
      index: 1,
      active: { model: 'arome', temperature: 14 },
      verdict: HIGH,
    });
    expect(briefing).toMatchObject({
      model: 'arome',
      temperature: 14,
      others: 3,
      confidence: 'high',
      drivers: ['temperature'],
    });
    expect(briefing?.meanGap).toBeCloseTo((0.6 + 0.6 + 1.4) / 3);
    expect(briefing?.maxGap).toBeCloseTo(1.4);
  });

  it('ne compte ni le modele retenu ni un modele sans valeur a cette heure', () => {
    const briefing = briefingAt({
      bundle: bundleWith({ arome: 14, gfs: null, ecmwf: 16 }),
      index: 0,
      active: { model: 'arome', temperature: 14 },
      verdict: HIGH,
    });
    expect(briefing?.others).toBe(1);
    expect(briefing?.meanGap).toBeCloseTo(2);
  });

  it('dit qu aucun autre modele ne couvre l heure plutot qu un ecart de zero', () => {
    const briefing = briefingAt({
      bundle: bundleWith({ arome: 14 }),
      index: 0,
      active: { model: 'arome', temperature: 14 },
      verdict: null,
    });
    expect(briefing).toMatchObject({
      others: 0,
      meanGap: null,
      maxGap: null,
      confidence: 'unavailable',
      drivers: [],
    });
  });

  it('ne dit rien sans temperature du modele retenu : jamais 0 °C par defaut', () => {
    expect(
      briefingAt({
        bundle: bundleWith({ arome: 14, gfs: 15 }),
        index: 0,
        active: { model: 'arome', temperature: null },
        verdict: HIGH,
      }),
    ).toBeNull();
  });

  it('tolere un index hors timeline : aucun autre modele', () => {
    const briefing = briefingAt({
      bundle: bundleWith({ arome: 14, gfs: 15 }),
      index: 99,
      active: { model: 'arome', temperature: 14 },
      verdict: HIGH,
    });
    expect(briefing?.others).toBe(0);
  });
});

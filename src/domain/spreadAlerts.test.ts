import { describe, expect, it } from 'vitest';
import { TEST_PLACE, buildBundle, buildHourlyTimeline } from '../../tests/factories';
import type { HourlyValues } from '../../tests/factories';
import { evaluateSpreadAlerts, modelSpreadAt } from './spreadAlerts';
import type { AlertRule, ModelId } from './types';

// 15 h 27 locale le 28 septembre 2026 ; timeline horaire des 6 heures suivantes.
const NOW = new Date('2026-09-28T13:27:00Z');
const TIMELINE = buildHourlyTimeline('2026-09-28T15:00', 6);

function rule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'ecart1',
    placeId: TEST_PLACE.id,
    variable: 'temperature',
    comparator: 'gt',
    threshold: 3,
    enabled: true,
    kind: 'spread',
    ...overrides,
  };
}

/** Temperatures par modele et par index, le reste par defaut. */
function bundleOf(temperatures: Partial<Record<ModelId, readonly (number | null)[]>>) {
  const models = Object.keys(temperatures) as ModelId[];
  return buildBundle({
    timeline: TIMELINE,
    models,
    values: (model, index): HourlyValues => ({ temperature: temperatures[model]?.[index] ?? null }),
  });
}

describe('modelSpreadAt', () => {
  it('rend l ecart entre le modele le plus haut et le plus bas, nommes', () => {
    const bundle = bundleOf({ arome: [12], arpege: [8], gfs: [10] });
    expect(modelSpreadAt(bundle, 0, 'temperature')).toEqual({
      variable: 'temperature',
      spread: 4,
      modelCount: 3,
      high: { model: 'arome', value: 12 },
      low: { model: 'arpege', value: 8 },
    });
  });

  it('compte les rafales pour le vent, et la pluie en mm par heure', () => {
    const bundle = buildBundle({
      timeline: TIMELINE,
      models: ['arome', 'gfs'],
      values: (model) =>
        model === 'arome'
          ? { windGust: 80, precipitation: 0 }
          : { windGust: 50, precipitation: 2.5 },
    });
    expect(modelSpreadAt(bundle, 0, 'wind')).toMatchObject({
      spread: 30,
      high: { model: 'arome' },
    });
    expect(modelSpreadAt(bundle, 0, 'precipitation')).toMatchObject({
      spread: 2.5,
      high: { model: 'gfs', value: 2.5 },
      low: { model: 'arome', value: 0 },
    });
  });

  it('ignore une valeur absente, jamais comptee comme zero, et se tait sous deux modeles', () => {
    const bundle = bundleOf({ arome: [12], arpege: [null], gfs: [null] });
    expect(modelSpreadAt(bundle, 0, 'temperature')).toBeNull();
    const withGap = bundleOf({ arome: [12], arpege: [null], gfs: [9] });
    expect(modelSpreadAt(withGap, 0, 'temperature')).toMatchObject({ spread: 3, modelCount: 2 });
    expect(modelSpreadAt(bundleOf({ arome: [12, 13] }), 1, 'temperature')).toBeNull();
    // Hors de la timeline d'un modele : saute.
    expect(modelSpreadAt(bundleOf({ arome: [12], gfs: [9] }), 5, 'temperature')).toBeNull();
  });

  it('en cas d egalite de valeurs, garde le premier modele de la liste', () => {
    const bundle = bundleOf({ arome: [10], arpege: [10] });
    expect(modelSpreadAt(bundle, 0, 'temperature')).toMatchObject({
      spread: 0,
      high: { model: 'arome' },
      low: { model: 'arome' },
    });
  });
});

describe('evaluateSpreadAlerts', () => {
  const diverging = bundleOf({
    arome: [10, 14, 16, 15, 12, 10],
    arpege: [10, 10, 10, 10, 10, 10],
  });

  it('declenche des que l ecart depasse le seuil, avec la premiere heure et le pic', () => {
    const [hit] = evaluateSpreadAlerts({ rules: [rule()], bundle: diverging, now: NOW });
    expect(hit?.first).toMatchObject({ time: '2026-09-28T16:00', spread: 4 });
    expect(hit?.extreme).toMatchObject({ time: '2026-09-28T17:00', spread: 6 });
    expect(hit?.extreme.high).toEqual({ model: 'arome', value: 16 });
    expect(hit?.extreme.low).toEqual({ model: 'arpege', value: 10 });
    // 16 h, 17 h et 18 h depassent 3 °C ; 15 h (0) et 19 h (2) non.
    expect(hit?.hours).toBe(3);
  });

  it('exige un ecart strictement superieur au seuil', () => {
    expect(
      evaluateSpreadAlerts({ rules: [rule({ threshold: 6 })], bundle: diverging, now: NOW }),
    ).toEqual([]);
  });

  it('ne retient que les regles d ecart actives de ce lieu', () => {
    const rules = [
      rule({ id: 'a', enabled: false }),
      rule({ id: 'b', placeId: 'ailleurs' }),
      rule({ id: 'c', kind: 'value' }),
      rule({ id: 'd', kind: undefined }),
      rule({ id: 'e' }),
    ];
    const hits = evaluateSpreadAlerts({ rules, bundle: diverging, now: NOW });
    expect(hits.map((h) => h.rule.id)).toEqual(['e']);
  });

  it('ne regarde que les 72 prochaines heures, passe exclu', () => {
    const timeline = buildHourlyTimeline('2026-09-27T12:00', 120);
    const bundle = buildBundle({
      timeline,
      models: ['arome', 'arpege'],
      // Ecart de 8 degres avant maintenant (index 27 = 15 h) et au-dela de
      // l'horizon (a partir de l'index 100, soit 72 h et demie), pas entre les deux.
      values: (model, index) => ({
        temperature: model === 'arome' && (index <= 27 || index >= 100) ? 20 : 12,
      }),
    });
    expect(evaluateSpreadAlerts({ rules: [rule()], bundle, now: NOW })).toEqual([]);
  });

  it('ne declenche rien sans deux modeles a comparer', () => {
    const lone = bundleOf({ arome: [30, 30, 30, 30, 30, 30] });
    expect(evaluateSpreadAlerts({ rules: [rule()], bundle: lone, now: NOW })).toEqual([]);
  });

  it('garde le premier pic en cas d egalite', () => {
    const bundle = bundleOf({
      arome: [10, 15, 15, 10, 10, 10],
      arpege: [10, 10, 10, 10, 10, 10],
    });
    const [hit] = evaluateSpreadAlerts({ rules: [rule()], bundle, now: NOW });
    expect(hit?.extreme.time).toBe('2026-09-28T16:00');
  });
});

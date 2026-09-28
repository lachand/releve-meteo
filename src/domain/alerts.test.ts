import { describe, expect, it } from 'vitest';
import { hourlyPoint } from '../../tests/factories';
import { ALERT_HORIZON_HOURS, evaluateAlerts } from './alerts';
import type { AlertPoint } from './alerts';
import type { AlertRule, ModelId } from './types';

// 15 h 27 locale le 28 septembre 2026.
const NOW = new Date('2026-09-28T13:27:00Z');

function point(
  time: string,
  values: { temperature?: number | null; precipitation?: number | null; windGust?: number | null },
  model: ModelId = 'arome',
): AlertPoint {
  return { ...hourlyPoint(time, values), model };
}

function rule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'r1',
    placeId: 'lyon',
    variable: 'temperature',
    comparator: 'lt',
    threshold: 2,
    enabled: true,
    ...overrides,
  };
}

const HOURS = [
  point('2026-09-28T15:00', { temperature: 9, precipitation: 0, windGust: 20 }),
  point('2026-09-28T16:00', { temperature: 5, precipitation: 0.2, windGust: 35 }),
  point('2026-09-29T04:00', { temperature: 1.5, precipitation: 0, windGust: 30 }, 'arpege'),
  point('2026-09-29T05:00', { temperature: 0.4, precipitation: 0, windGust: 25 }, 'arpege'),
  point('2026-09-29T06:00', { temperature: 1.2, precipitation: 4.2, windGust: 64 }, 'arpege'),
  point('2026-09-29T07:00', { temperature: 3, precipitation: 6.8, windGust: 71 }, 'arpege'),
];

describe('evaluateAlerts', () => {
  it("trouve la premiere heure ou la regle est franchie et l'extreme atteint, avec le modele", () => {
    const [hit] = evaluateAlerts({ rules: [rule()], placeId: 'lyon', points: HOURS, now: NOW });
    expect(hit).toMatchObject({
      first: { time: '2026-09-29T04:00', value: 1.5, model: 'arpege' },
      extreme: { time: '2026-09-29T05:00', value: 0.4, model: 'arpege' },
      hours: 3,
    });
  });

  it('compare la pluie horaire et les rafales au-dessus du seuil', () => {
    const hits = evaluateAlerts({
      rules: [
        rule({ id: 'pluie', variable: 'precipitation', comparator: 'gt', threshold: 5 }),
        rule({ id: 'vent', variable: 'wind', comparator: 'gt', threshold: 60 }),
      ],
      placeId: 'lyon',
      points: HOURS,
      now: NOW,
    });
    expect(hits.map((hit) => [hit.rule.id, hit.first.time, hit.extreme.value])).toEqual([
      ['pluie', '2026-09-29T07:00', 6.8],
      ['vent', '2026-09-29T06:00', 71],
    ]);
  });

  it("ignore les heures passees, l'heure en cours comprise tant qu'elle n'est pas echue", () => {
    const hits = evaluateAlerts({
      rules: [rule({ comparator: 'gt', threshold: 8 })],
      placeId: 'lyon',
      points: HOURS,
      now: NOW,
    });
    // 15 h est passee (15 h 27) : seule une heure a venir peut declencher.
    expect(hits).toEqual([]);
  });

  it("n'evalue ni les regles desactivees, ni celles d'un autre lieu", () => {
    const hits = evaluateAlerts({
      rules: [rule({ enabled: false }), rule({ id: 'ailleurs', placeId: 'brest' })],
      placeId: 'lyon',
      points: HOURS,
      now: NOW,
    });
    expect(hits).toEqual([]);
  });

  it('nomme le modele qui a fourni la valeur quand le champ a ete complete', () => {
    const completed: AlertPoint = {
      ...point('2026-09-28T20:00', { windGust: 80 }),
      filledFrom: { windGust: 'icon_d2' },
    };
    const [hit] = evaluateAlerts({
      rules: [rule({ variable: 'wind', comparator: 'gt', threshold: 60 })],
      placeId: 'lyon',
      points: [completed],
      now: NOW,
    });
    expect(hit?.first.model).toBe('icon_d2');
  });

  it("ne declenche jamais sur une valeur absente : null n'est pas zero", () => {
    const hits = evaluateAlerts({
      rules: [rule({ variable: 'precipitation', comparator: 'lt', threshold: 0.1 })],
      placeId: 'lyon',
      points: [point('2026-09-28T18:00', { precipitation: null })],
      now: NOW,
    });
    expect(hits).toEqual([]);
  });

  it(`s'arrete a l'horizon de ${ALERT_HORIZON_HOURS} heures`, () => {
    const hits = evaluateAlerts({
      rules: [rule()],
      placeId: 'lyon',
      points: [point('2026-10-02T06:00', { temperature: -3 })],
      now: NOW,
    });
    expect(hits).toEqual([]);
  });
});

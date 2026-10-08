import { describe, expect, it } from 'vitest';
import { TEST_PLACE, buildHourlyTimeline } from '../../tests/factories';
import { evaluateProbabilityAlerts, memberShare } from './probabilityAlerts';
import type { EnsembleHourly } from './ensemble';
import type { WeatherAlertRule } from './types';

// 15 h 27 locale le 28 septembre 2026 ; trois heures d'ensemble a venir.
const NOW = new Date('2026-09-28T13:27:00Z');
const TIMELINE = buildHourlyTimeline('2026-09-28T15:00', 4);

function rule(overrides: Partial<WeatherAlertRule> = {}): WeatherAlertRule {
  return {
    id: 'proba1',
    placeId: TEST_PLACE.id,
    variable: 'temperature',
    comparator: 'lt',
    threshold: 0,
    enabled: true,
    kind: 'probability',
    probability: 40,
    ...overrides,
  };
}

/** Dix membres : `temperature[m]` est la trajectoire du membre m. */
function ensemble(temperature: readonly (readonly (number | null)[])[]): EnsembleHourly {
  return { timeline: TIMELINE, temperature, precipitation: [], windGust: [] };
}

const FROST_AT_HOUR_2 = [
  [3, 2, -1, 1],
  [3, 2, -2, 1],
  [3, 2, -1, 1],
  [3, 2, -3, 1],
  [3, 2, 1, 1],
  [3, 2, 1, 1],
  [3, 2, 1, 1],
  [3, 2, 1, 1],
  [3, 2, 1, 1],
  [3, 2, 1, 1],
];

describe('memberShare', () => {
  it('compte la part des membres sous le seuil, une valeur absente n entrant pas dans le total', () => {
    expect(memberShare([1, -1, null, -2], 'lt', 0)).toBeCloseTo(2 / 3);
    expect(memberShare([1, 2], 'lt', 0)).toBe(0);
  });

  it('rend null sans aucun membre, jamais zero', () => {
    expect(memberShare([], 'lt', 0)).toBeNull();
    expect(memberShare([null, null], 'gt', 0)).toBeNull();
  });

  it('compare strictement, comme les alertes de valeur', () => {
    expect(memberShare([0, 0], 'lt', 0)).toBe(0);
    expect(memberShare([0, 1], 'gt', 0)).toBe(0.5);
  });
});

describe('evaluateProbabilityAlerts, valeurs absentes', () => {
  it('saute une heure sans aucun membre et ne compte pas un membre sans valeur comme un franchissement', () => {
    const members = [
      [3, null, -1, null],
      [3, null, -2, 1],
      [3, null, null, 1],
      // Un membre sans aucune valeur n'entre pas dans le compte.
      [null, null, null, null],
    ];
    const hits = evaluateProbabilityAlerts({
      rules: [rule({ probability: 50 })],
      placeId: TEST_PLACE.id,
      ensemble: ensemble(members),
      now: NOW,
    });
    // Heure 1 : aucun membre, ignoree. Heure 2 : 2 membres sur 2 ayant une valeur sont sous 0.
    expect(hits[0]?.first).toEqual({ time: TIMELINE[2], share: 1 });
    expect(hits[0]?.hours).toBe(1);
    // Au moins une fois : 2 membres sur 3.
    expect(hits[0]?.anyTime).toBeCloseTo(2 / 3);
  });
});

describe('evaluateProbabilityAlerts, pic plus tard', () => {
  it('retient l heure ou la part monte le plus haut, pas la premiere atteinte', () => {
    const members = [
      [3, -1, -1, 3],
      [3, -1, -1, 3],
      [3, 3, -1, 3],
      [3, 3, -1, 3],
      [3, 3, 3, 3],
    ];
    const hits = evaluateProbabilityAlerts({
      rules: [rule({ probability: 40 })],
      placeId: TEST_PLACE.id,
      ensemble: ensemble(members),
      now: NOW,
    });
    expect(hits[0]?.first).toEqual({ time: TIMELINE[1], share: 0.4 });
    expect(hits[0]?.peak).toEqual({ time: TIMELINE[2], share: 0.8 });
  });
});

describe('evaluateProbabilityAlerts, pic', () => {
  it('garde la premiere heure la plus haute quand la part redescend ensuite', () => {
    const members = [
      [3, -1, -1, 3],
      [3, -1, -1, 3],
      [3, -1, 3, 3],
      [3, 3, 3, 3],
      [3, 3, 3, 3],
    ];
    const hits = evaluateProbabilityAlerts({
      rules: [rule({ probability: 40 })],
      placeId: TEST_PLACE.id,
      ensemble: ensemble(members),
      now: NOW,
    });
    // Heure 1 : 3 membres sur 5 ; heure 2 : 2 sur 5 (toujours dans la limite de 40 %).
    expect(hits[0]?.peak).toEqual({ time: TIMELINE[1], share: 0.6 });
    expect(hits[0]?.hours).toBe(2);
  });
});

describe('evaluateProbabilityAlerts', () => {
  it('se declenche quand assez de membres franchissent le seuil la meme heure', () => {
    const hits = evaluateProbabilityAlerts({
      rules: [rule()],
      placeId: TEST_PLACE.id,
      ensemble: ensemble(FROST_AT_HOUR_2),
      now: NOW,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      first: { time: TIMELINE[2], share: 0.4 },
      peak: { time: TIMELINE[2], share: 0.4 },
      hours: 1,
      memberCount: 10,
    });
  });

  it('dit aussi la part des membres qui franchissent le seuil au moins une fois', () => {
    const members = [
      [3, -1, 3, 3],
      [3, 3, -1, 3],
      [3, 3, 3, -1],
      [3, 3, 3, 3],
    ];
    const hits = evaluateProbabilityAlerts({
      rules: [rule({ probability: 25 })],
      placeId: TEST_PLACE.id,
      ensemble: ensemble(members),
      now: NOW,
    });
    expect(hits[0]?.anyTime).toBe(0.75);
    expect(hits[0]?.peak.share).toBe(0.25);
  });

  it('ne se declenche pas sous le pourcentage choisi', () => {
    expect(
      evaluateProbabilityAlerts({
        rules: [rule({ probability: 50 })],
        placeId: TEST_PLACE.id,
        ensemble: ensemble(FROST_AT_HOUR_2),
        now: NOW,
      }),
    ).toEqual([]);
  });

  it('ignore les regles d un autre lieu, desactivees ou d un autre type', () => {
    const input = { placeId: TEST_PLACE.id, ensemble: ensemble(FROST_AT_HOUR_2), now: NOW };
    expect(evaluateProbabilityAlerts({ ...input, rules: [rule({ placeId: 'ailleurs' })] })).toEqual(
      [],
    );
    expect(evaluateProbabilityAlerts({ ...input, rules: [rule({ enabled: false })] })).toEqual([]);
    expect(evaluateProbabilityAlerts({ ...input, rules: [rule({ kind: 'value' })] })).toEqual([]);
    expect(
      evaluateProbabilityAlerts({
        ...input,
        rules: [{ ...rule(), probability: undefined }],
      }),
    ).toEqual([]);
  });

  it('ne regarde que l horizon d alerte, jamais les heures passees', () => {
    const past = buildHourlyTimeline('2026-09-28T10:00', 2);
    const frozenInThePast: EnsembleHourly = {
      timeline: past,
      temperature: [[-5, -5]],
      precipitation: [],
      windGust: [],
    };
    expect(
      evaluateProbabilityAlerts({
        rules: [rule({ probability: 10 })],
        placeId: TEST_PLACE.id,
        ensemble: frozenInThePast,
        now: NOW,
      }),
    ).toEqual([]);
  });

  it('lit les rafales pour le vent et la pluie en mm par heure', () => {
    const windy: EnsembleHourly = {
      timeline: TIMELINE,
      temperature: [],
      precipitation: [
        [0, 0, 3, 0],
        [0, 0, 0, 0],
      ],
      windGust: [
        [50, 80, 50, 50],
        [50, 70, 50, 50],
      ],
    };
    const wind = evaluateProbabilityAlerts({
      rules: [rule({ variable: 'wind', comparator: 'gt', threshold: 60, probability: 100 })],
      placeId: TEST_PLACE.id,
      ensemble: windy,
      now: NOW,
    });
    expect(wind[0]?.first.time).toBe(TIMELINE[1]);
    const rain = evaluateProbabilityAlerts({
      rules: [rule({ variable: 'precipitation', comparator: 'gt', threshold: 2, probability: 50 })],
      placeId: TEST_PLACE.id,
      ensemble: windy,
      now: NOW,
    });
    expect(rain[0]?.first.time).toBe(TIMELINE[2]);
  });

  it('ne dit rien d une variable sans membre, jamais un zero', () => {
    expect(
      evaluateProbabilityAlerts({
        rules: [rule({ variable: 'wind', comparator: 'gt', threshold: 60 })],
        placeId: TEST_PLACE.id,
        ensemble: ensemble(FROST_AT_HOUR_2),
        now: NOW,
      }),
    ).toEqual([]);
  });
});

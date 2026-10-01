import { describe, expect, it } from 'vitest';
import {
  AIR_DEFAULT_THRESHOLDS,
  AIR_VARIABLES,
  airValueAt,
  evaluateAirAlerts,
  isAirRule,
} from './airAlerts';
import type { AirSeries } from './airAlerts';
import type { AirAlertRule, AlertRule } from './types';

// 15 h 27 locale le 28 septembre 2026.
const NOW = new Date('2026-09-28T13:27:00Z');
const timeline = Array.from(
  { length: 6 },
  (_, i) => `2026-09-28T${String(15 + i).padStart(2, '0')}:00`,
) as AirSeries['timeline'];

const AIR: AirSeries = {
  timeline,
  uvIndex: [3, 5, 7, 8, 4, null],
  europeanAqi: [30, 40, 70, 90, 50, null],
  pm2_5: [10, 12, 30, 20, 8, null],
  pollen: {
    birch: [0, 10, 90, 150, 20, null],
    grass: [5, 100, 40, 60, 30, null],
  },
};

function rule(overrides: Partial<AirAlertRule> = {}): AirAlertRule {
  return {
    id: 'air1',
    kind: 'air',
    placeId: 'lyon',
    variable: 'uv',
    comparator: 'gt',
    threshold: 6,
    enabled: true,
    ...overrides,
  };
}

const evaluate = (rules: readonly AlertRule[], now = NOW) =>
  evaluateAirAlerts({ rules, placeId: 'lyon', air: AIR, now });

describe('airValueAt', () => {
  it('lit chaque grandeur, et le pollen le plus fort avec son nom', () => {
    expect(airValueAt(AIR, 2, 'uv')).toEqual({ value: 7, pollen: null });
    expect(airValueAt(AIR, 2, 'aqi')).toEqual({ value: 70, pollen: null });
    expect(airValueAt(AIR, 2, 'pm25')).toEqual({ value: 30, pollen: null });
    expect(airValueAt(AIR, 1, 'pollen')).toEqual({ value: 100, pollen: 'grass' });
    expect(airValueAt(AIR, 3, 'pollen')).toEqual({ value: 150, pollen: 'birch' });
  });

  it('rend null sans valeur, jamais zero', () => {
    expect(airValueAt(AIR, 5, 'uv')).toBeNull();
    expect(airValueAt(AIR, 5, 'pollen')).toBeNull();
    expect(airValueAt(AIR, 99, 'aqi')).toBeNull();
  });
});

describe('evaluateAirAlerts', () => {
  it('signale la premiere heure au-dessus du seuil, le pic et la duree', () => {
    const [hit] = evaluate([rule()]);
    expect(hit?.first).toEqual({ time: '2026-09-28T17:00', value: 7, pollen: null });
    expect(hit?.extreme).toEqual({ time: '2026-09-28T18:00', value: 8, pollen: null });
    expect(hit?.hours).toBe(2);
  });

  it('exige un depassement strict, et se tait en dessous', () => {
    expect(evaluate([rule({ threshold: 8 })])).toEqual([]);
    expect(evaluate([rule({ threshold: 7.9 })])).toHaveLength(1);
  });

  it('nomme le pollen qui culmine', () => {
    const [hit] = evaluate([rule({ variable: 'pollen', threshold: 80 })]);
    expect(hit?.first).toMatchObject({ time: '2026-09-28T16:00', value: 100, pollen: 'grass' });
    expect(hit?.extreme).toMatchObject({ value: 150, pollen: 'birch' });
  });

  it('ne retient que les heures a venir de l horizon, et ignore une valeur absente', () => {
    // 17 h 30 : 15 h, 16 h et 17 h sont passees ; le pic de 18 h reste.
    const [hit] = evaluate([rule()], new Date('2026-09-28T15:30:00Z'));
    expect(hit?.first.time).toBe('2026-09-28T18:00');
    expect(hit?.hours).toBe(1);
    expect(evaluate([rule({ variable: 'aqi', threshold: 95 })])).toEqual([]);
  });

  it('ignore les regles inactives, d un autre lieu ou qui ne portent pas sur l air', () => {
    const weather: AlertRule = {
      id: 'w',
      placeId: 'lyon',
      variable: 'temperature',
      comparator: 'gt',
      threshold: 0,
      enabled: true,
    };
    expect(evaluate([rule({ enabled: false }), rule({ placeId: 'brest' }), weather])).toEqual([]);
  });
});

describe('constantes', () => {
  it('propose un seuil pour chaque grandeur', () => {
    for (const variable of AIR_VARIABLES) {
      expect(AIR_DEFAULT_THRESHOLDS[variable]).toBeGreaterThan(0);
    }
    expect(isAirRule(rule())).toBe(true);
    expect(
      isAirRule({ ...rule(), kind: undefined, variable: 'wind' } as unknown as AlertRule),
    ).toBe(false);
  });
});

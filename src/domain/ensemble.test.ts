import type { EnsembleHourly } from './ensemble';
import { describe, expect, it } from 'vitest';
import { buildHourlyTimeline } from '../../tests/factories';
import {
  ENSEMBLE_GUST_KMH,
  dailyEnsemble,
  exceedanceProbability,
  hourlyQuantiles,
  hourlyRainProbability,
  quantile,
  quantiles,
  rainOutlook,
  temperatureSpaghetti,
} from './ensemble';

describe('quantile', () => {
  it('interpole lineairement (methode 7)', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
    expect(quantile([10], 0.9)).toBe(10);
  });

  it('retourne NaN sur un echantillon vide', () => {
    expect(quantile([], 0.5)).toBeNaN();
  });
});

describe('quantiles', () => {
  it('ignore les null et trie l echantillon', () => {
    const q = quantiles([5, null, 1, 3, Number.NaN]);
    expect(q).toMatchObject({ min: 1, median: 3, max: 5 });
  });

  it('retourne null sans valeur', () => {
    expect(quantiles([null, null])).toBeNull();
  });
});

describe('exceedanceProbability', () => {
  it('compte la part des membres au-dessus du seuil', () => {
    expect(exceedanceProbability([0, 1, 2, 5, null], 1)).toBe(0.75);
    expect(exceedanceProbability([null], 1)).toBeNull();
  });
});

describe('dailyEnsemble', () => {
  // Deux jours complets puis 3 heures du troisieme (tronque en bout d'horizon).
  const timeline = buildHourlyTimeline('2026-08-17T00:00', 51);
  const member = (offset: number, rain: number) => ({
    temperature: timeline.map((_, i) => 10 + offset + (i % 24)),
    precipitation: timeline.map((_, i) => (i < 24 ? rain / 24 : 0)),
  });
  const members = [member(0, 0), member(1, 2), member(2, 12), member(3, 0.5)];

  it('agrege par jour et par membre, puis calcule les quantiles', () => {
    const days = dailyEnsemble({
      timeline,
      temperature: members.map((m) => m.temperature),
      precipitation: members.map((m) => m.precipitation),
      windGust: [],
    });
    expect(days.map((d) => d.date)).toEqual(['2026-08-17', '2026-08-18']);
    const first = days[0];
    expect(first?.tempMax).toMatchObject({ min: 33, max: 36 });
    expect(first?.tempMin).toMatchObject({ min: 10, max: 13 });
    expect(first?.rainProbability).toBe(0.5);
    expect(first?.heavyRainProbability).toBe(0.25);
    expect(first?.memberCount).toBe(4);
    expect(days[1]?.rainProbability).toBe(0);
  });

  it('ecarte les journees de membre trop lacunaires plutot que de les completer', () => {
    const holey = timeline.map((_, i) => (i < 24 && i % 2 === 0 ? null : 12));
    const days = dailyEnsemble({
      timeline,
      temperature: [holey],
      precipitation: [holey],
      windGust: [],
    });
    expect(days[0]?.tempMax).toBeNull();
    expect(days[0]?.precipitation).toBeNull();
    expect(days[0]?.memberCount).toBe(0);
    expect(days[1]?.tempMax?.max).toBe(12);
  });

  it('traite un membre plus court que la timeline comme lacunaire', () => {
    const days = dailyEnsemble({
      timeline,
      temperature: [[1, 2, 3]],
      precipitation: [[0]],
      windGust: [],
    });
    expect(days[0]?.tempMax).toBeNull();
  });
});

describe('dailyEnsemble, gel et rafales', () => {
  const timeline = buildHourlyTimeline('2026-08-17T00:00', 24);
  const flat = (value: number, dip?: number) =>
    timeline.map((_, i) => (dip !== undefined && i === 5 ? dip : value));

  it('donne la part des membres dont le minimum du jour est a 0 °C ou moins', () => {
    const days = dailyEnsemble({
      timeline,
      // Minimums : -2, 0 (gel : le seuil est inclus), 1,5 et 3.
      temperature: [flat(4, -2), flat(4, 0), flat(4, 1.5), flat(3)],
      precipitation: [flat(0), flat(0), flat(0), flat(0)],
      windGust: [],
    });
    expect(days[0]?.frostProbability).toBe(0.5);
  });

  it('donne la part des membres dont la rafale maximale atteint le seuil', () => {
    const days = dailyEnsemble({
      timeline,
      temperature: [flat(10), flat(10), flat(10), flat(10)],
      precipitation: [flat(0), flat(0), flat(0), flat(0)],
      windGust: [flat(30, 70), flat(30, ENSEMBLE_GUST_KMH), flat(30, 59), flat(30)],
    });
    expect(days[0]?.gustProbability).toBe(0.5);
  });

  it('ne dit rien des rafales quand les membres n en donnent pas : null, pas 0 %', () => {
    const days = dailyEnsemble({
      timeline,
      temperature: [flat(10)],
      precipitation: [flat(0)],
      windGust: [],
    });
    expect(days[0]?.gustProbability).toBeNull();
    expect(days[0]?.frostProbability).toBe(0);
  });

  it('ignore une rafale lacunaire plutot que de la completer par zero', () => {
    const holey = timeline.map((_, i) => (i < 12 ? null : 80));
    const days = dailyEnsemble({
      timeline,
      temperature: [flat(10), flat(10)],
      precipitation: [flat(0), flat(0)],
      windGust: [holey, flat(10)],
    });
    // Seul le membre complet compte, et il reste sous le seuil.
    expect(days[0]?.gustProbability).toBe(0);
  });
});

describe('hourlyQuantiles et hourlyRainProbability', () => {
  const members = [
    [1, 0, null],
    [3, 0.5, null],
    [2, 0.2],
  ];

  it('calcule les quantiles heure par heure', () => {
    const q = hourlyQuantiles(members, 3);
    expect(q[0]?.median).toBe(2);
    expect(q[2]).toBeNull();
  });

  it('calcule la probabilite horaire de pluie, seuil par defaut 0,1 mm', () => {
    expect(hourlyRainProbability(members, 3)).toEqual([1, 2 / 3, null]);
    expect(hourlyRainProbability(members, 2, 0.3)[1]).toBeCloseTo(1 / 3);
  });
});

describe('rainOutlook', () => {
  // 10 h 12 locales le 28 septembre 2026 : l'heure courante (10 h) est gardee.
  const NOW = new Date('2026-09-28T08:12:00Z');
  const timeline = Array.from(
    { length: 6 },
    (_, i) => `2026-09-28T${String(8 + i).padStart(2, '0')}:00`,
  ) as EnsembleHourly['timeline'];
  const members = [
    [0, 0, 0.4, 2, 0, null],
    [0, 0, 0, 3, 0, null],
    [0, 0, 0.2, 1, 0, null],
    [0, 0, 0, 0, 0, null],
  ];
  const ensemble: EnsembleHourly = {
    timeline,
    temperature: members,
    precipitation: members,
    windGust: [],
  };

  it('donne, heure par heure, la part des membres qui annoncent de la pluie et le cumul probable', () => {
    const hours = rainOutlook({ ensemble, now: NOW });
    // 8 h et 9 h sont passees de plus d'une heure : seules 10 h a 13 h restent.
    expect(hours.map((h) => h.time)).toEqual([
      '2026-09-28T10:00',
      '2026-09-28T11:00',
      '2026-09-28T12:00',
      '2026-09-28T13:00',
    ]);
    expect(hours[0]).toMatchObject({ probability: 0.5, memberCount: 4 });
    expect(hours[0]?.median).toBeCloseTo(0.1);
    expect(hours[1]).toMatchObject({ probability: 0.75 });
    expect(hours[1]?.p90).toBeCloseTo(2.7);
    expect(hours[2]).toMatchObject({ probability: 0, median: 0, p90: 0 });
  });

  it('garde une heure sans aucune valeur a null, jamais a zero', () => {
    const hours = rainOutlook({ ensemble, now: new Date('2026-09-28T11:30:00Z'), hours: 3 });
    expect(hours.at(-1)).toEqual({
      time: '2026-09-28T13:00',
      probability: null,
      median: null,
      p90: null,
      memberCount: 0,
    });
  });

  it('respecte la fenetre demandee, et rend une liste vide sans membre', () => {
    expect(rainOutlook({ ensemble, now: NOW, hours: 1 })).toHaveLength(2);
    expect(rainOutlook({ ensemble: { ...ensemble, precipitation: [] }, now: NOW })).toEqual([]);
  });
});

describe('temperatureSpaghetti', () => {
  // 10 h 12 locales le 28 septembre 2026.
  const NOW = new Date('2026-09-28T08:12:00Z');
  const timeline = Array.from(
    { length: 5 },
    (_, i) => `2026-09-28T${String(9 + i).padStart(2, '0')}:00`,
  ) as EnsembleHourly['timeline'];
  const temperature = [
    [10, 11, 12, 13, null],
    [10, 12, 14, 16, null],
    [10, 13, 16, 19, null],
    [10, 14, 18, 22, null],
    [10, 15, 20, 25, null],
  ];
  const ensemble: EnsembleHourly = { timeline, temperature, precipitation: [], windGust: [] };

  it('trace chaque membre, sa mediane et le fuseau de neuf membres sur dix, de l heure courante', () => {
    const result = temperatureSpaghetti({ ensemble, now: NOW });
    // 9 h est passee de plus d'une heure : 10 h a 13 h restent.
    expect(result?.times).toEqual([
      '2026-09-28T10:00',
      '2026-09-28T11:00',
      '2026-09-28T12:00',
      '2026-09-28T13:00',
    ]);
    expect(result?.members).toHaveLength(5);
    expect(result?.members[0]).toEqual([11, 12, 13, null]);
    expect(result?.median).toEqual([13, 16, 19, null]);
    expect(result?.p10[0]).toBeCloseTo(11.4);
    expect(result?.p90[0]).toBeCloseTo(14.6);
  });

  it('dit l etalement a l heure la plus lointaine qui a des valeurs, jamais une heure vide', () => {
    const result = temperatureSpaghetti({ ensemble, now: NOW });
    expect(result?.widest?.time).toBe('2026-09-28T12:00');
    expect(result?.widest?.p90).toBeGreaterThan(result?.widest?.p10 ?? Infinity);
  });

  it('rend null sans membre ni heure dans la fenetre, et garde le vide a null', () => {
    expect(
      temperatureSpaghetti({ ensemble: { ...ensemble, temperature: [] }, now: NOW }),
    ).toBeNull();
    expect(temperatureSpaghetti({ ensemble, now: new Date('2026-10-05T08:00:00Z') })).toBeNull();
    const empty = temperatureSpaghetti({
      ensemble: { ...ensemble, temperature: [[null, null, null, null, null]] },
      now: NOW,
    });
    expect(empty?.widest).toBeNull();
    expect(empty?.median).toEqual([null, null, null, null]);
  });

  it('respecte la fenetre demandee', () => {
    expect(temperatureSpaghetti({ ensemble, now: NOW, hours: 1 })?.times).toHaveLength(2);
  });
});

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

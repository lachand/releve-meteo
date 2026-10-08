import { describe, expect, it } from 'vitest';
import {
  OWN_READINGS,
  compareReadings,
  isOwnReading,
  predictionFor,
  readingProblem,
  readingsOf,
  removeReading,
  upsertReading,
} from './ownReadings';
import type { OwnReading, PreviousDaySeries } from './ownReadings';
import type { LocalIsoHour } from './types';

function reading(date: string, overrides: Partial<OwnReading> = {}): OwnReading {
  return { placeId: 'lyon', date, tempMax: 20, tempMin: 10, rain: 0, ...overrides };
}

/** 24 heures du jour : temperature constante par heure, pluie horaire constante. */
function hours(date: string): readonly LocalIsoHour[] {
  return Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00` as const);
}

function series(
  date: string,
  temperature: Partial<Record<'arome' | 'gfs', readonly (number | null)[]>>,
  precipitation: Partial<Record<'arome' | 'gfs', readonly (number | null)[]>> = {},
): PreviousDaySeries {
  return { timeline: hours(date), temperature, precipitation };
}

const ramp = (low: number, high: number): number[] =>
  Array.from({ length: 24 }, (_, h) => (h === 5 ? low : h === 15 ? high : (low + high) / 2));

describe('readingProblem', () => {
  const ok = { date: '2026-10-03', tempMax: 20, tempMin: 10, rain: 0 };
  const today = '2026-10-04';

  it('accepte une saisie complete ou partielle', () => {
    expect(readingProblem(ok, today)).toBeNull();
    expect(readingProblem({ ...ok, tempMin: null, rain: null }, today)).toBeNull();
  });

  it('refuse une saisie vide, hors bornes, inversee ou datee du futur', () => {
    expect(readingProblem({ ...ok, tempMax: null, tempMin: null, rain: null }, today)).toBe(
      'empty',
    );
    expect(readingProblem({ ...ok, tempMax: 80 }, today)).toBe('range');
    expect(readingProblem({ ...ok, rain: -1 }, today)).toBe('range');
    expect(readingProblem({ ...ok, tempMax: 5, tempMin: 9 }, today)).toBe('order');
    expect(readingProblem({ ...ok, date: '2026-10-05' }, today)).toBe('date');
    expect(readingProblem({ ...ok, date: 'hier' }, today)).toBe('date');
  });

  it('accepte aujourd hui : la saisie du jour en cours est permise', () => {
    expect(readingProblem({ ...ok, date: today }, today)).toBeNull();
  });
});

describe('isOwnReading, upsertReading, removeReading', () => {
  it('rejette un enregistrement abime', () => {
    expect(isOwnReading(reading('2026-10-03'))).toBe(true);
    expect(isOwnReading({ ...reading('2026-10-03'), tempMax: 'chaud' })).toBe(false);
    expect(isOwnReading({ ...reading('2026-10-03'), date: 'hier' })).toBe(false);
    expect(isOwnReading({ ...reading('2026-10-03'), tempMax: undefined })).toBe(false);
    expect(isOwnReading(null)).toBe(false);
  });

  it('remplace la saisie du meme jour et du meme lieu, la plus recente en tete', () => {
    const list = upsertReading(
      [reading('2026-10-01'), reading('2026-10-03'), reading('2026-10-03', { placeId: 'brest' })],
      reading('2026-10-03', { tempMax: 22 }),
    );
    expect(list.map((r) => [r.placeId, r.date, r.tempMax])).toEqual([
      ['lyon', '2026-10-03', 22],
      ['brest', '2026-10-03', 20],
      ['lyon', '2026-10-01', 20],
    ]);
  });

  it('ne garde pas plus de saisies que la limite', () => {
    const many = Array.from({ length: OWN_READINGS.maxKept + 3 }, (_, i) =>
      reading(`2025-01-${String(1 + (i % 28)).padStart(2, '0')}`, { placeId: `p${i}` }),
    );
    expect(upsertReading(many, reading('2026-10-03'))).toHaveLength(OWN_READINGS.maxKept);
  });

  it('retire une saisie, sans toucher aux autres', () => {
    const list = removeReading(
      [reading('2026-10-01'), reading('2026-10-02')],
      'lyon',
      '2026-10-01',
    );
    expect(list.map((r) => r.date)).toEqual(['2026-10-02']);
    expect(readingsOf(list, 'lyon')).toHaveLength(1);
    expect(readingsOf(list, 'brest')).toEqual([]);
  });
});

describe('predictionFor', () => {
  it('rend le maximum, le minimum et le cumul de pluie de la journee prevue la veille', () => {
    const s = series(
      '2026-10-03',
      { arome: ramp(8, 19) },
      { arome: Array.from({ length: 24 }, () => 0.25) },
    );
    expect(predictionFor(s, 'arome', '2026-10-03')).toEqual({ tempMax: 19, tempMin: 8, rain: 6 });
  });

  it('garde une valeur absente absente : trop peu d heures, jamais un zero', () => {
    const sparse = ramp(8, 19).map((v, i) => (i < 10 ? null : v));
    const s = series(
      '2026-10-03',
      { arome: sparse },
      { arome: Array.from({ length: 24 }, () => null) },
    );
    expect(predictionFor(s, 'arome', '2026-10-03')).toEqual({
      tempMax: null,
      tempMin: null,
      rain: null,
    });
  });

  it('rend null pour un modele qui n a rien rendu ou un jour absent', () => {
    const s = series('2026-10-03', { arome: ramp(8, 19) });
    expect(predictionFor(s, 'gfs', '2026-10-03')).toBeNull();
    expect(predictionFor(s, 'arome', '2026-10-09')).toBeNull();
  });
});

describe('compareReadings, plusieurs jours et instruments', () => {
  const today = '2026-10-05';
  const two: PreviousDaySeries = {
    timeline: [...hours('2026-10-03'), ...hours('2026-10-04')],
    temperature: { arome: [...ramp(9, 21), ...ramp(8, 18)], gfs: [...ramp(6, 17), ...ramp(5, 15)] },
    precipitation: { arome: Array.from({ length: 48 }, () => 0.1) },
  };

  it('moyenne les ecarts sur tous les jours compares', () => {
    const result = compareReadings({
      readings: [
        reading('2026-10-04', { tempMax: 18, tempMin: 8, rain: null }),
        reading('2026-10-03', { tempMax: 20, tempMin: 10, rain: null }),
      ],
      series: two,
      today,
    });
    expect(result.compared).toBe(2);
    // AROME : |21-20|, |9-10|, |18-18|, |8-8| : 4 valeurs, ecart moyen 0,5.
    expect(result.models[0]?.temperature).toEqual({ values: 4, mae: 0.5, bias: 0 });
  });

  it('departage a l ordre habituel deux modeles sans temperature comparable', () => {
    const rainBoth: PreviousDaySeries = {
      ...two,
      precipitation: {
        gfs: Array.from({ length: 48 }, () => 0.1),
        arome: Array.from({ length: 48 }, () => 0.1),
      },
    };
    const result = compareReadings({
      readings: [reading('2026-10-03', { tempMax: null, tempMin: null, rain: 2 })],
      series: rainBoth,
      today,
    });
    expect(result.models.map((m) => m.model)).toEqual(['arome', 'gfs']);
  });

  it('classe apres les autres un modele sans temperature comparable, et laisse de cote un jour sans prevision', () => {
    const result = compareReadings({
      readings: [
        reading('2026-10-03', { tempMax: null, tempMin: null, rain: 2 }),
        // Dans la fenetre, mais absent de la serie : laisse de cote.
        reading('2026-09-20'),
      ],
      series: two,
      today,
    });
    expect(result.compared).toBe(1);
    expect(result.skipped).toBe(1);
    // GFS n'a pas de pluie : sans valeur comparable, il n'a pas de ligne de classement.
    expect(result.models.map((m) => m.model)).toEqual(['arome']);
    expect(result.models[0]?.temperature).toBeNull();
    expect(result.days[0]?.models.map((m) => m.model)).toEqual(['arome', 'gfs']);
  });
});

describe('compareReadings', () => {
  const today = '2026-10-04';
  const s = series(
    '2026-10-03',
    { arome: ramp(9, 21), gfs: ramp(6, 17) },
    { arome: Array.from({ length: 24 }, () => 0.1), gfs: Array.from({ length: 24 }, () => 0) },
  );

  it('range les modeles du plus proche au plus eloigne de votre thermometre, avec le biais', () => {
    const result = compareReadings({
      readings: [reading('2026-10-03', { tempMax: 20, tempMin: 10, rain: 2 })],
      series: s,
      today,
    });
    expect(result.compared).toBe(1);
    expect(result.models.map((m) => m.model)).toEqual(['arome', 'gfs']);
    const arome = result.models[0];
    // |21 - 20| et |9 - 10| : erreur 1 ; biais (21 - 20) + (9 - 10) / 2 = 0.
    expect(arome?.temperature).toEqual({ values: 2, mae: 1, bias: 0 });
    const gfs = result.models[1];
    // |17 - 20| = 3 et |6 - 10| = 4 : erreur 3,5 ; biais -3,5.
    expect(gfs?.temperature).toEqual({ values: 2, mae: 3.5, bias: -3.5 });
    // Pluie : 2,4 mm prevus par AROME contre 2 mm releves ; GFS 0 contre 2.
    expect(arome?.rain?.mae).toBeCloseTo(0.4);
    expect(gfs?.rain?.mae).toBe(2);
  });

  it('detaille chaque jour : votre mesure puis ce que chaque modele avait prevu', () => {
    const result = compareReadings({
      readings: [reading('2026-10-03')],
      series: s,
      today,
    });
    expect(result.days).toHaveLength(1);
    expect(result.days[0]?.reading.date).toBe('2026-10-03');
    expect(result.days[0]?.models.map((m) => m.model)).toEqual(['arome', 'gfs']);
    expect(result.days[0]?.models[0]?.prediction.tempMax).toBe(21);
  });

  it('ne compare pas une saisie sans prevision de la veille, ni la journee en cours', () => {
    const result = compareReadings({
      readings: [reading('2026-10-03'), reading('2026-09-01'), reading(today)],
      series: s,
      today,
    });
    expect(result.compared).toBe(1);
    expect(result.skipped).toBe(2);
  });

  it('ne compare pas les saisies plus vieilles que la fenetre de la prevision de la veille', () => {
    const old = '2026-08-01';
    const result = compareReadings({
      readings: [reading(old)],
      series: series(old, { arome: ramp(9, 21) }),
      today,
    });
    expect(result.compared).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('ne compare que ce que vous avez saisi : un champ vide n est jamais un zero', () => {
    const result = compareReadings({
      readings: [reading('2026-10-03', { tempMin: null, rain: null })],
      series: s,
      today,
    });
    const arome = result.models[0];
    expect(arome?.temperature).toEqual({ values: 1, mae: 1, bias: 1 });
    expect(arome?.rain).toBeNull();
  });

  it('rend des listes vides sans aucune saisie comparable', () => {
    const result = compareReadings({ readings: [], series: s, today });
    expect(result).toEqual({ days: [], models: [], compared: 0, skipped: 0 });
  });
});

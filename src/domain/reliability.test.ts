import { describe, expect, it } from 'vitest';
import {
  DAILY_ERRORS,
  DAY_PERIODS,
  PERIOD_BIAS,
  biasByPeriod,
  dailyErrors,
  errorStats,
  matchSamples,
  pruneArchive,
  rainContingency,
  rankByError,
  scoreFromSamples,
  verifyModel,
  weeklyComparison,
} from './reliability';
import type { DailyError } from './reliability';
import type { ArchivedForecast, VerificationPair } from './reliability';
import type { LocalIsoHour } from './types';

function pairs(values: readonly [number | null, number | null][]): VerificationPair[] {
  return values.map(([predicted, observed]) => ({ predicted, observed }));
}

describe('errorStats', () => {
  it('calcule MAE, biais et RMSE sur les paires completes', () => {
    const stats = errorStats(
      pairs([
        [12, 10],
        [8, 10],
        [11, 10],
      ]),
    );
    expect(stats?.count).toBe(3);
    expect(stats?.mae).toBeCloseTo(5 / 3);
    expect(stats?.bias).toBeCloseTo(1 / 3);
    expect(stats?.rmse).toBeCloseTo(Math.sqrt(9 / 3));
  });

  it('ignore les paires incompletes, jamais comptees comme zero', () => {
    const stats = errorStats(
      pairs([
        [null, 10],
        [12, null],
        [11, 10],
      ]),
    );
    expect(stats).toEqual({ mae: 1, bias: 1, rmse: 1, count: 1 });
  });

  it('retourne null sans paire complete', () => {
    expect(errorStats([])).toBeNull();
    expect(errorStats(pairs([[null, 1]]))).toBeNull();
  });
});

describe('rainContingency', () => {
  it('remplit la table et calcule precision et score de Heidke', () => {
    const table = rainContingency(
      pairs([
        [1, 2], // hit
        [0, 1], // miss
        [1, 0], // fausse alerte
        [0, 0], // rejet correct
        [0, 0], // rejet correct
        [null, 3], // ignore
      ]),
    );
    expect(table).toMatchObject({ hits: 1, misses: 1, falseAlarms: 1, correctNegatives: 2 });
    expect(table.accuracy).toBeCloseTo(3 / 5);
    // HSS = 2(1*2 - 1*1) / ((1+1)(1+2) + (1+1)(1+2)) = 2 / 12
    expect(table.heidke).toBeCloseTo(2 / 12);
  });

  it('retourne des scores indefinis sans echantillon', () => {
    const table = rainContingency([]);
    expect(table.accuracy).toBeNull();
    expect(table.heidke).toBeNull();
  });

  it('respecte un seuil personnalise', () => {
    expect(rainContingency(pairs([[0.5, 0.5]]), 1).correctNegatives).toBe(1);
  });
});

describe('verifyModel', () => {
  const many = pairs(Array.from({ length: 12 }, (_, i) => [i + 1, i] as [number, number]));

  it('est pret au-dela du seuil d echantillons', () => {
    const v = verifyModel({
      model: 'arome',
      variable: 'temperature',
      leadDays: 1,
      pairs: many,
      reference: 'estimated',
    });
    expect(v.status).toBe('ready');
    expect(v.stats?.mae).toBe(1);
    expect(v.rain).toBeNull();
    expect(v.reference).toBe('estimated');
  });

  it('ajoute la table de contingence pour les precipitations', () => {
    const v = verifyModel({
      model: 'arome',
      variable: 'precipitation',
      leadDays: 1,
      pairs: many,
      reference: 'observed',
    });
    expect(v.rain?.hits).toBe(11);
  });

  it('reste en collecte sous le seuil, sans statistique exposee', () => {
    const v = verifyModel({
      model: 'gfs',
      variable: 'wind',
      leadDays: 2,
      pairs: many.slice(0, 3),
      reference: 'estimated',
      minSamples: 5,
    });
    expect(v.status).toBe('collecting');
    expect(v.stats).toBeNull();
    expect(v.rain).toBeNull();
    expect(v.sampleCount).toBe(3);
  });

  it('compte zero echantillon sans paire complete', () => {
    const v = verifyModel({
      model: 'gfs',
      variable: 'precipitation',
      leadDays: 2,
      pairs: [],
      reference: 'estimated',
    });
    expect(v.sampleCount).toBe(0);
    expect(v.rain).toBeNull();
  });
});

describe('rankByError', () => {
  it('classe par MAE croissante, les modeles en collecte en fin', () => {
    const base = {
      variable: 'temperature' as const,
      leadDays: 1,
      rain: null,
      reference: 'estimated' as const,
    };
    const ranked = rankByError([
      { ...base, model: 'gfs', stats: null, sampleCount: 2, status: 'collecting' },
      {
        ...base,
        model: 'arpege',
        stats: { mae: 1.4, bias: 0, rmse: 1.5, count: 30 },
        sampleCount: 30,
        status: 'ready',
      },
      {
        ...base,
        model: 'arome',
        stats: { mae: 0.9, bias: 0, rmse: 1, count: 30 },
        sampleCount: 30,
        status: 'ready',
      },
    ]);
    expect(ranked.map((v) => v.model)).toEqual(['arome', 'arpege', 'gfs']);
  });
});

const archived = (targetTime: string, predicted: number, issuedAt = 0): ArchivedForecast => ({
  placeId: 'p',
  model: 'arome',
  variable: 'temperature',
  targetTime,
  predicted,
  issuedAt,
  leadHours: 24,
});

describe('scoreFromSamples', () => {
  it('reste en collecte sous RELIABILITY.minSamples', () => {
    const score = scoreFromSamples('arome', 'temperature', [
      { archived: archived('2026-08-17T12:00', 14), observed: 13 },
    ]);
    expect(score).toMatchObject({ status: 'collecting', mae: null, bias: null, sampleCount: 1 });
  });

  it('reste en collecte sans echantillon', () => {
    expect(scoreFromSamples('arome', 'temperature', []).sampleCount).toBe(0);
  });

  it('calcule mae et biais au-dela du seuil', () => {
    const samples = Array.from({ length: 10 }, (_, i) => ({
      archived: archived(`2026-08-17T${String(i).padStart(2, '0')}:00`, 15),
      observed: 14,
    }));
    expect(scoreFromSamples('arome', 'temperature', samples)).toMatchObject({
      status: 'ready',
      mae: 1,
      bias: 1,
      sampleCount: 10,
    });
  });
});

describe('matchSamples', () => {
  it('apparie par instant cible et ignore les non apparies', () => {
    const observed = new Map([['2026-08-17T12:00', 13]]);
    const samples = matchSamples(
      [archived('2026-08-17T12:00', 14), archived('2026-08-17T13:00', 15)],
      observed,
    );
    expect(samples).toHaveLength(1);
    expect(samples[0]?.observed).toBe(13);
  });
});

describe('pruneArchive', () => {
  it('retire les entrees emises avant la fenetre de retention', () => {
    const now = new Date('2026-09-28T12:00:00Z');
    const day = 24 * 60 * 60 * 1000;
    const kept = pruneArchive(
      [archived('a', 1, now.getTime() - 91 * day), archived('b', 1, now.getTime() - 89 * day)],
      now,
      90,
    );
    expect(kept.map((e) => e.targetTime)).toEqual(['b']);
  });
});

describe('biasByPeriod', () => {
  /** Une paire par heure d'une journee : le modele est trop chaud de `gap(h)` a l'heure h. */
  function day(date: string, gap: (hour: number) => number | null): VerificationPair[] {
    return Array.from({ length: 24 }, (_, hour) => {
      const offset = gap(hour);
      return {
        predicted: offset === null ? null : 10 + offset,
        observed: 10,
        time: `${date}T${String(hour).padStart(2, '0')}:00` as LocalIsoHour,
      };
    });
  }

  it('moyenne l ecart de chaque moment de la journee, sur plusieurs jours', () => {
    const all = [
      ...day('2026-09-25', (h) => (h < 6 ? -2 : 1)),
      ...day('2026-09-26', (h) => (h < 6 ? -1 : 1)),
    ];
    const periods = biasByPeriod(all);
    expect(periods?.map((p) => p.period.key)).toEqual(['night', 'morning', 'afternoon', 'evening']);
    expect(periods?.[0]).toMatchObject({ count: 12, bias: -1.5 });
    expect(periods?.[1]).toMatchObject({ count: 12, bias: 1 });
    expect(DAY_PERIODS.map((p) => p.label)).toEqual([
      'la nuit',
      'le matin',
      'l’après-midi',
      'le soir',
    ]);
  });

  it('ignore les paires sans heure ou sans valeur, jamais comptees comme zero', () => {
    const all = [
      ...day('2026-09-25', (h) => (h >= 12 && h < 18 ? null : 0)),
      ...day('2026-09-26', (h) => (h >= 12 && h < 18 ? null : 0)),
      { predicted: 30, observed: 10 },
    ];
    const periods = biasByPeriod(all);
    expect(periods?.map((p) => p.period.key)).toEqual(['night', 'morning', 'evening']);
  });

  it('omet un moment sous le minimum de paires, et rend null s il n en reste aucun', () => {
    const one = day('2026-09-25', () => 1);
    expect(biasByPeriod(one)).toBeNull();
    expect(PERIOD_BIAS.minPairs).toBeGreaterThan(6);
    const two = [...one, ...day('2026-09-26', () => 1)];
    expect(biasByPeriod(two)).toHaveLength(4);
    expect(biasByPeriod([])).toBeNull();
  });
});

describe('verifyModel, biais par moment de la journee', () => {
  const hourly = (n: number): VerificationPair[] =>
    Array.from({ length: n }, (_, i) => ({
      predicted: 11,
      observed: 10,
      time: `2026-09-${String(10 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00` as LocalIsoHour,
    }));

  it('ne le calcule que pour la temperature, une fois la verification prete', () => {
    const base = { model: 'arome', leadDays: 1, reference: 'observed', minSamples: 10 } as const;
    expect(
      verifyModel({ ...base, variable: 'temperature', pairs: hourly(72) }).periods,
    ).toHaveLength(4);
    expect(verifyModel({ ...base, variable: 'wind', pairs: hourly(72) }).periods).toBeNull();
    expect(verifyModel({ ...base, variable: 'temperature', pairs: hourly(5) }).periods).toBeNull();
  });
});

describe('dailyErrors', () => {
  /** n heures d'un jour, toutes ecartees de `gap` degres. */
  function hours(date: string, n: number, gap: number): VerificationPair[] {
    return Array.from({ length: n }, (_, hour) => ({
      predicted: 10 + gap,
      observed: 10,
      time: `${date}T${String(hour).padStart(2, '0')}:00` as LocalIsoHour,
    }));
  }

  it('rend l erreur absolue moyenne de chaque jour, du plus ancien au plus recent', () => {
    const daily = dailyErrors([...hours('2026-09-26', 24, -2), ...hours('2026-09-25', 24, 1)]);
    expect(daily).toEqual([
      { date: '2026-09-25', mae: 1, count: 24 },
      { date: '2026-09-26', mae: 2, count: 24 },
    ]);
  });

  it('ignore les paires sans heure ou sans valeur, et les jours trop courts', () => {
    const daily = dailyErrors([
      ...hours('2026-09-25', DAILY_ERRORS.minPairs, 1),
      ...hours('2026-09-26', DAILY_ERRORS.minPairs - 1, 5),
      { predicted: 30, observed: 10 },
      { predicted: null, observed: 10, time: '2026-09-25T20:00' as LocalIsoHour },
      { predicted: 12, observed: null, time: '2026-09-25T21:00' as LocalIsoHour },
    ]);
    expect(daily).toEqual([{ date: '2026-09-25', mae: 1, count: DAILY_ERRORS.minPairs }]);
  });

  it('rend null sans aucune journee exploitable', () => {
    expect(dailyErrors([])).toBeNull();
    expect(dailyErrors(hours('2026-09-25', 3, 1))).toBeNull();
  });
});

describe('verifyModel, erreur par jour', () => {
  it('ne la calcule que pour la temperature, une fois la verification prete', () => {
    const pairsOf = Array.from({ length: 48 }, (_, i) => ({
      predicted: 11,
      observed: 10,
      time: `2026-09-${String(10 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00` as LocalIsoHour,
    }));
    const base = { model: 'arome', leadDays: 1, reference: 'observed', minSamples: 10 } as const;
    expect(verifyModel({ ...base, variable: 'temperature', pairs: pairsOf }).daily).toHaveLength(2);
    expect(verifyModel({ ...base, variable: 'wind', pairs: pairsOf }).daily).toBeNull();
    expect(
      verifyModel({ ...base, variable: 'temperature', pairs: pairsOf.slice(0, 5) }).daily,
    ).toBeNull();
  });
});

describe('weeklyComparison', () => {
  /** Une erreur journaliere par jour, de `from` a `to` inclus (jours de septembre 2026). */
  function days(from: number, to: number, mae: number): DailyError[] {
    return Array.from({ length: to - from + 1 }, (_, i) => ({
      date: `2026-09-${String(from + i).padStart(2, '0')}`,
      mae,
      count: 24,
    }));
  }

  it("designe le plus juste sur les 7 derniers jours et sur les 7 d'avant", () => {
    // Fenetre recente : 22 a 28 ; precedente : 15 a 21.
    const result = weeklyComparison([
      { model: 'arome', daily: [...days(15, 21, 2), ...days(22, 28, 0.8)] },
      { model: 'arpege', daily: [...days(15, 21, 1.1), ...days(22, 28, 1.5)] },
    ]);
    expect(result?.lastDate).toBe('2026-09-28');
    expect(result?.recent).toMatchObject({ model: 'arome', days: 7 });
    expect(result?.recent?.mae).toBeCloseTo(0.8);
    expect(result?.previous).toMatchObject({ model: 'arpege', days: 7 });
  });

  it('pese chaque jour par son nombre de paires', () => {
    const result = weeklyComparison([
      {
        model: 'arome',
        daily: [
          { date: '2026-09-25', mae: 1, count: 24 },
          { date: '2026-09-26', mae: 4, count: 6 },
          ...days(27, 28, 1),
        ],
      },
      { model: 'arpege', daily: days(25, 28, 1.3) },
    ]);
    // Pondere : AROME (24 + 24 + 24 + 24) / 78 = 1.23, devant ARPEGE 1.3 ;
    // non pondere, la mauvaise journee courte (4) le ferait passer a 1.75.
    expect(result?.recent?.model).toBe('arome');
    expect(result?.recent?.mae).toBeCloseTo(96 / 78);
  });

  it('exige quatre jours comptes et au moins deux modeles, sans quoi il ne designe personne', () => {
    expect(weeklyComparison([])).toBeNull();
    expect(weeklyComparison([{ model: 'arome', daily: days(22, 28, 1) }])).toBeNull();
    const short = weeklyComparison([
      { model: 'arome', daily: days(22, 28, 1) },
      { model: 'arpege', daily: days(26, 28, 0.5) },
    ]);
    expect(short).toBeNull();
  });

  it('garde une fenetre quand l autre n a pas assez de jours', () => {
    const result = weeklyComparison([
      { model: 'arome', daily: days(24, 28, 1) },
      { model: 'arpege', daily: days(24, 28, 2) },
    ]);
    expect(result?.recent?.model).toBe('arome');
    expect(result?.previous).toBeNull();
  });

  it('en cas d egalite, garde le premier modele de la liste', () => {
    const result = weeklyComparison([
      { model: 'arome', daily: days(22, 28, 1) },
      { model: 'arpege', daily: days(22, 28, 1) },
    ]);
    expect(result?.recent?.model).toBe('arome');
  });
});

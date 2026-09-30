import { describe, expect, it } from 'vitest';
import {
  DAY_PERIODS,
  PERIOD_BIAS,
  biasByPeriod,
  errorStats,
  matchSamples,
  pruneArchive,
  rainContingency,
  rankByError,
  scoreFromSamples,
  verifyModel,
} from './reliability';
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

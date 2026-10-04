import { describe, expect, it } from 'vitest';
import {
  DRIFT,
  driftOf,
  isOutlookIssue,
  mergeOutlooks,
  pickReference,
  summarizeDays,
} from './forecastDrift';
import type { DaySummary, OutlookIssue } from './forecastDrift';
import type { BlendedDay } from './dailyBlend';

const HOUR = 60 * 60 * 1000;
// Samedi 3 octobre 2026, 21 h 30 a Paris.
const NOW = new Date('2026-10-03T19:30:00Z');

function day(date: string, overrides: Partial<DaySummary> = {}): DaySummary {
  return { date, model: 'arome', tempMax: 18, tempMin: 8, rain: 0, ...overrides };
}

function issue(hoursAgo: number, days: readonly DaySummary[]): OutlookIssue {
  return { issuedAt: NOW.getTime() - hoursAgo * HOUR, days };
}

describe('summarizeDays', () => {
  it('garde une valeur absente absente, jamais un zero', () => {
    const blended = [
      {
        date: '2026-10-04',
        model: 'arome',
        tempMax: { value: 17.5 },
        tempMin: { value: null },
        precipitationSum: { value: null },
      },
    ] as unknown as readonly BlendedDay[];
    expect(summarizeDays(blended)).toEqual([
      {
        date: '2026-10-04',
        model: 'arome',
        tempMax: 17.5,
        tempMin: null,
        rain: null,
        confidence: null,
      },
    ]);
  });

  it('garde la confiance dite pour chaque jour', () => {
    const blended = [
      {
        date: '2026-10-04',
        model: 'arome',
        tempMax: { value: 17 },
        tempMin: { value: 9 },
        precipitationSum: { value: 0 },
      },
    ] as unknown as readonly BlendedDay[];
    expect(summarizeDays(blended, () => 'high')[0]?.confidence).toBe('high');
  });
});

describe('mergeOutlooks', () => {
  it('garde une prevision par heure d emission, la plus recente remplacant la precedente', () => {
    const first = issue(0.5, [day('2026-10-04')]);
    const same = {
      issuedAt: first.issuedAt + 10 * 60 * 1000,
      days: [day('2026-10-04', { tempMax: 20 })],
    };
    const merged = mergeOutlooks([first], same, NOW);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.days[0]?.tempMax).toBe(20);
  });

  it('ecarte ce qui date de plus de 72 heures et le plus abime sans casser', () => {
    const old = issue(80, [day('2026-10-04')]);
    const fresh = issue(25, [day('2026-10-04')]);
    const merged = mergeOutlooks([old, fresh, { issuedAt: 'x' }, null], issue(0, []), NOW);
    expect(merged.map((m) => m.issuedAt)).toEqual([NOW.getTime(), fresh.issuedAt]);
  });

  it('ne garde pas plus de previsions que la fenetre n en demande', () => {
    const many = Array.from({ length: 100 }, (_, i) => issue(i * 0.7, [day('2026-10-04')]));
    expect(mergeOutlooks(many, issue(0, []), NOW).length).toBeLessThanOrEqual(DRIFT.maxIssues);
  });
});

describe('mergeOutlooks, sans prevision gardee', () => {
  it('part d une liste vide quand rien n est garde ou que le contenu n est pas une liste', () => {
    expect(mergeOutlooks(undefined, issue(0, []), NOW)).toHaveLength(1);
    expect(mergeOutlooks('abime', issue(0, []), NOW)).toHaveLength(1);
  });
});

describe('isOutlookIssue', () => {
  it('rejette un enregistrement mal forme', () => {
    expect(isOutlookIssue(issue(1, [day('2026-10-04')]))).toBe(true);
    expect(isOutlookIssue({ issuedAt: 1, days: [{ date: 'demain' }] })).toBe(false);
    expect(isOutlookIssue({ issuedAt: 1, days: [{ ...day('2026-10-04'), tempMax: 'x' }] })).toBe(
      false,
    );
    expect(isOutlookIssue(null)).toBe(false);
    expect(isOutlookIssue({ issuedAt: 1, days: [null] })).toBe(false);
    expect(isOutlookIssue({ issuedAt: 1, days: ['demain'] })).toBe(false);
    // La confiance est facultative, mais doit etre un niveau connu.
    expect(isOutlookIssue(issue(1, [day('2026-10-04', { confidence: 'low' })]))).toBe(true);
    expect(isOutlookIssue(issue(1, [day('2026-10-04', { confidence: null })]))).toBe(true);
    expect(
      isOutlookIssue({ issuedAt: 1, days: [{ ...day('2026-10-04'), confidence: 'tres haute' }] }),
    ).toBe(false);
  });
});

describe('pickReference', () => {
  it('prend la prevision emise le plus pres de 24 heures avant, dans la fenetre', () => {
    const a = issue(20, [day('2026-10-04')]);
    const b = issue(24.5, [day('2026-10-04')]);
    const c = issue(33, [day('2026-10-04')]);
    expect(pickReference([a, b, c], NOW)).toBe(b);
  });

  it('ne rend rien sans prevision de la veille : on ne compare pas a une autre echeance', () => {
    expect(
      pickReference([issue(2, [day('2026-10-04')]), issue(50, [day('2026-10-04')])], NOW),
    ).toBeNull();
    expect(pickReference([], NOW)).toBeNull();
  });
});

describe('driftOf', () => {
  const reference = issue(24, [
    day('2026-10-03'),
    day('2026-10-04', { tempMax: 18, tempMin: 8, rain: 0 }),
    day('2026-10-05', { tempMax: 15, tempMin: 9, rain: 0.4 }),
  ]);

  it('mesure ce qui a bouge pour chaque jour a venir, hier compris dans la comparaison', () => {
    const drift = driftOf({
      current: [
        day('2026-10-04', { tempMax: 21, tempMin: 7.5, rain: 0 }),
        day('2026-10-05', { tempMax: 15.5, tempMin: 9, rain: 6 }),
      ],
      reference,
      now: NOW,
    });
    expect(drift.days.map((d) => d.date)).toEqual(['2026-10-04', '2026-10-05']);
    expect(drift.days[0]).toMatchObject({
      moved: true,
      tempMax: { before: 18, now: 21, delta: 3 },
    });
    expect(drift.days[0]?.tempMin?.delta).toBe(-0.5);
    expect(drift.days[1]).toMatchObject({
      moved: true,
      fields: ['rain'],
      rain: { before: 0.4, now: 6, delta: 5.6 },
    });
    expect(drift.moved.map((d) => d.date)).toEqual(['2026-10-04', '2026-10-05']);
  });

  it('dit stable quand rien ne depasse les seuils', () => {
    const drift = driftOf({
      current: [day('2026-10-04', { tempMax: 18.9 }), day('2026-10-05', { tempMax: 14.2 })],
      reference,
      now: NOW,
    });
    expect(drift.moved).toEqual([]);
    expect(drift.days).toHaveLength(2);
  });

  it('compte le passage du sec au mouille meme sous le seuil en millimetres', () => {
    const drift = driftOf({
      current: [day('2026-10-04', { rain: 1.2 })],
      reference,
      now: NOW,
    });
    expect(drift.days[0]?.moved).toBe(true);
    expect(drift.days[0]?.fields).toEqual(['rain']);
  });

  it('nomme chaque grandeur qui a bouge, minimum compris', () => {
    const drift = driftOf({
      current: [day('2026-10-04', { tempMax: 16, tempMin: 11 })],
      reference,
      now: NOW,
    });
    expect(drift.days[0]?.fields).toEqual(['tempMax', 'tempMin']);
  });

  it('ne compare jamais une valeur absente a une valeur : le champ reste vide', () => {
    const drift = driftOf({
      current: [day('2026-10-04', { tempMax: null, rain: null })],
      reference,
      now: NOW,
    });
    expect(drift.days[0]?.tempMax).toBeNull();
    expect(drift.days[0]?.rain).toBeNull();
    expect(drift.days[0]?.moved).toBe(false);
  });

  it('signale un changement de modele, qui peut expliquer l ecart', () => {
    const drift = driftOf({
      current: [day('2026-10-04', { model: 'arpege', tempMax: 21 })],
      reference,
      now: NOW,
    });
    expect(drift.days[0]).toMatchObject({
      modelBefore: 'arome',
      modelNow: 'arpege',
      modelChanged: true,
    });
  });

  it('ignore un jour absent de la prevision de la veille ou deja passe', () => {
    const drift = driftOf({
      current: [day('2026-10-02'), day('2026-10-09')],
      reference,
      now: NOW,
    });
    expect(drift.days).toEqual([]);
  });

  it('dit depuis quand : l heure d emission de la prevision comparee', () => {
    const drift = driftOf({ current: [day('2026-10-04')], reference, now: NOW });
    expect(drift.since).toBe(reference.issuedAt);
  });
});

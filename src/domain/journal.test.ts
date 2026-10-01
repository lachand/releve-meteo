import { describe, expect, it } from 'vitest';
import {
  JOURNAL,
  isJournalEntry,
  journalEntryFrom,
  mergeJournal,
  summarizeJournal,
} from './journal';
import type { JournalEntry } from './journal';
import type { YesterdayReview } from './yesterdayReview';

function entry(date: string, models: JournalEntry['models'], overrides = {}): JournalEntry {
  return {
    date,
    stationName: 'Lyon / Bron',
    hours: 24,
    observedMin: 11,
    observedMax: 22,
    models,
    ...overrides,
  };
}

const D2_FIRST = [
  { model: 'icon_d2', mae: 0.9, bias: -0.2 },
  { model: 'arome', mae: 1.4, bias: 0.5 },
] as const;
const AROME_FIRST = [
  { model: 'arome', mae: 0.8, bias: 0.1 },
  { model: 'icon_d2', mae: 1.1, bias: -0.4 },
] as const;

describe('journalEntryFrom', () => {
  it('garde le bilan d hier tel quel, modele par modele, sans les ecarts de pointe', () => {
    const review: YesterdayReview = {
      date: '2026-09-27',
      hours: 23,
      observedMin: 10.5,
      observedMax: 21,
      models: [
        { model: 'icon_d2', pairs: 23, bias: -0.2, mae: 0.9, minGap: 0.1, maxGap: -1 },
        { model: 'arome', pairs: 23, bias: 0.5, mae: 1.4, minGap: 0.4, maxGap: 0.9 },
      ],
    };
    expect(journalEntryFrom(review, 'Lyon / Bron')).toEqual({
      date: '2026-09-27',
      stationName: 'Lyon / Bron',
      hours: 23,
      observedMin: 10.5,
      observedMax: 21,
      models: [
        { model: 'icon_d2', mae: 0.9, bias: -0.2 },
        { model: 'arome', mae: 1.4, bias: 0.5 },
      ],
    });
  });
});

describe('isJournalEntry', () => {
  it('accepte une entree complete et refuse tout ce qui est abime', () => {
    expect(isJournalEntry(entry('2026-09-27', D2_FIRST))).toBe(true);
    expect(isJournalEntry(null)).toBe(false);
    expect(isJournalEntry('hier')).toBe(false);
    expect(isJournalEntry({ ...entry('hier', D2_FIRST) })).toBe(false);
    expect(isJournalEntry({ ...entry('2026-09-27', D2_FIRST), observedMax: 'chaud' })).toBe(false);
    expect(isJournalEntry({ ...entry('2026-09-27', D2_FIRST), stationName: 3 })).toBe(false);
    expect(isJournalEntry({ ...entry('2026-09-27', D2_FIRST), models: 'aucun' })).toBe(false);
    expect(
      isJournalEntry(entry('2026-09-27', [{ model: 'inconnu', mae: 1, bias: 0 }] as never)),
    ).toBe(false);
    expect(
      isJournalEntry(entry('2026-09-27', [{ model: 'arome', mae: Number.NaN, bias: 0 }])),
    ).toBe(false);
    expect(isJournalEntry(entry('2026-09-27', [null] as never))).toBe(false);
  });
});

describe('mergeJournal', () => {
  it('range du plus recent au plus ancien et remplace le meme jour', () => {
    const first = mergeJournal([], entry('2026-09-26', D2_FIRST));
    const second = mergeJournal(first, entry('2026-09-28', AROME_FIRST));
    const third = mergeJournal(second, entry('2026-09-26', AROME_FIRST));
    expect(third.map((e) => e.date)).toEqual(['2026-09-28', '2026-09-26']);
    expect(third[1]?.models[0]?.model).toBe('arome');
  });

  it('ecarte un enregistrement abime ou absent, sans casser le journal', () => {
    expect(mergeJournal(undefined, entry('2026-09-27', D2_FIRST))).toHaveLength(1);
    expect(
      mergeJournal(
        [{ date: 'x' }, null, entry('2026-09-25', D2_FIRST)],
        entry('2026-09-27', D2_FIRST),
      ),
    ).toHaveLength(2);
  });

  it('garde au plus le nombre de jours demande, les plus recents', () => {
    let journal: readonly JournalEntry[] = [];
    for (let day = 1; day <= 5; day += 1) {
      journal = mergeJournal(journal, entry(`2026-09-0${day}`, D2_FIRST), 3);
    }
    expect(journal.map((e) => e.date)).toEqual(['2026-09-05', '2026-09-04', '2026-09-03']);
    expect(JOURNAL.maxDays).toBeGreaterThan(JOURNAL.shownDays);
  });
});

describe('summarizeJournal', () => {
  it('rend null pour un journal vide', () => {
    expect(summarizeJournal([])).toBeNull();
  });

  it('compte les jours gagnes et l erreur moyenne de chaque modele', () => {
    const journal = [
      entry('2026-09-28', AROME_FIRST),
      entry('2026-09-27', D2_FIRST),
      entry('2026-09-26', D2_FIRST),
      entry('2026-09-25', [{ model: 'arpege', mae: 2, bias: 1 }]),
    ];
    const summary = summarizeJournal(journal);
    expect(summary).toMatchObject({ days: 4, from: '2026-09-25', to: '2026-09-28' });
    expect(summary?.leaders).toEqual([
      { model: 'icon_d2', wins: 2 },
      { model: 'arome', wins: 1 },
      { model: 'arpege', wins: 1 },
    ]);
    const d2 = summary?.meanMae.find((m) => m.model === 'icon_d2');
    expect(d2?.days).toBe(3);
    expect(d2?.mae).toBeCloseTo((1.1 + 0.9 + 0.9) / 3);
    expect(summary?.meanMae[0]?.model).toBe('icon_d2');
  });

  it('departage a egalite par l ordre des modeles, sans journee sans modele', () => {
    const tie = summarizeJournal([
      entry('2026-09-28', [{ model: 'arpege', mae: 1, bias: 0 }]),
      entry('2026-09-27', [{ model: 'arome', mae: 1, bias: 0 }]),
      entry('2026-09-26', []),
    ]);
    expect(tie?.leaders.map((l) => l.model)).toEqual(['arome', 'arpege']);
    expect(tie?.meanMae.map((m) => m.model)).toEqual(['arome', 'arpege']);
  });
});

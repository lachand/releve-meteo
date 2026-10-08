import { describe, expect, it } from 'vitest';
import {
  CALIBRATION,
  calibrationRecordFrom,
  calibrationSummary,
  isCalibrationRecord,
  mergeCalibration,
  temperatureConfidenceOn,
} from './calibration';
import type { CalibrationRecord } from './calibration';
import type { ConfidenceVerdict } from './confidence';
import type { DaySummary, OutlookIssue } from './forecastDrift';
import type { JournalEntry } from './journal';
import type { ConfidenceLevel } from './types';

const HOUR = 60 * 60 * 1000;

function journal(date: string, observedMin: number, observedMax: number): JournalEntry {
  return { date, stationName: 'Lyon / Bron', hours: 24, observedMin, observedMax, models: [] };
}

function day(date: string, overrides: Partial<DaySummary> = {}): DaySummary {
  return {
    date,
    model: 'arome',
    tempMax: 20,
    tempMin: 10,
    rain: 0,
    confidence: 'high',
    ...overrides,
  };
}

/** Prevision emise `hoursBeforeNoon` heures avant midi (Paris, heure d'ete = UTC+2) du jour donne. */
function issueFor(
  date: string,
  hoursBeforeNoon: number,
  days: readonly DaySummary[],
): OutlookIssue {
  const noonUtc = new Date(`${date}T10:00:00Z`).getTime();
  return { issuedAt: noonUtc - hoursBeforeNoon * HOUR, days };
}

function record(date: string, level: CalibrationRecord['level'], error: number): CalibrationRecord {
  return { date, level, error, model: 'arome', issuedAt: 1 };
}

describe('temperatureConfidenceOn', () => {
  const verdict = (temperature: ConfidenceLevel | undefined): ConfidenceVerdict => ({
    level: temperature ?? 'unavailable',
    byVariable: temperature === undefined ? {} : { temperature },
    drivers: [],
    modelCount: 3,
  });

  it('lit la confiance de la temperature a midi du jour', () => {
    const timeline = ['2026-10-04T11:00', '2026-10-04T12:00', '2026-10-04T13:00'] as const;
    const verdicts = [verdict('low'), verdict('high'), verdict('low')];
    expect(temperatureConfidenceOn('2026-10-04', timeline, verdicts)).toBe('high');
  });

  it('rend null sans midi, sans verdict ou quand la temperature n est pas notee', () => {
    const timeline = ['2026-10-04T12:00'] as const;
    expect(temperatureConfidenceOn('2026-10-05', timeline, [verdict('high')])).toBeNull();
    expect(temperatureConfidenceOn('2026-10-04', timeline, [])).toBeNull();
    expect(temperatureConfidenceOn('2026-10-04', timeline, [verdict(undefined)])).toBeNull();
    expect(temperatureConfidenceOn('2026-10-04', timeline, [verdict('unavailable')])).toBeNull();
  });
});

describe('calibrationRecordFrom', () => {
  it('compare ce qui a ete annonce la veille a ce que la station a mesure', () => {
    const entry = journal('2026-10-04', 9, 22);
    const issue = issueFor('2026-10-04', 24, [day('2026-10-04', { tempMax: 20, tempMin: 10 })]);
    const result = calibrationRecordFrom({ entry, issues: [issue] });
    // |20 - 22| = 2 ; |10 - 9| = 1 : erreur moyenne 1,5.
    expect(result).toEqual({
      date: '2026-10-04',
      level: 'high',
      error: 1.5,
      model: 'arome',
      issuedAt: issue.issuedAt,
    });
  });

  it('prend la prevision emise le plus pres de 24 heures avant midi, dans la fenetre', () => {
    const entry = journal('2026-10-04', 10, 20);
    const near = issueFor('2026-10-04', 25, [day('2026-10-04', { confidence: 'medium' })]);
    const far = issueFor('2026-10-04', 34, [day('2026-10-04', { confidence: 'low' })]);
    const tooClose = issueFor('2026-10-04', 3, [day('2026-10-04', { confidence: 'low' })]);
    expect(calibrationRecordFrom({ entry, issues: [far, tooClose, near] })?.level).toBe('medium');
  });

  it('ne rend rien sans prevision de la veille, sans confiance ou sans valeur comparable', () => {
    const entry = journal('2026-10-04', 10, 20);
    expect(calibrationRecordFrom({ entry, issues: [] })).toBeNull();
    expect(
      calibrationRecordFrom({
        entry,
        issues: [issueFor('2026-10-04', 24, [day('2026-10-04', { confidence: null })])],
      }),
    ).toBeNull();
    expect(
      calibrationRecordFrom({
        entry,
        issues: [issueFor('2026-10-04', 24, [day('2026-10-04', { confidence: undefined })])],
      }),
    ).toBeNull();
    expect(
      calibrationRecordFrom({
        entry,
        issues: [issueFor('2026-10-04', 24, [day('2026-10-04', { tempMax: null, tempMin: null })])],
      }),
    ).toBeNull();
    expect(
      calibrationRecordFrom({
        entry,
        issues: [issueFor('2026-10-04', 24, [day('2026-10-05')])],
      }),
    ).toBeNull();
  });

  it('s appuie sur la seule valeur connue quand l autre manque', () => {
    const entry = journal('2026-10-04', 10, 21);
    const issue = issueFor('2026-10-04', 24, [day('2026-10-04', { tempMax: 19, tempMin: null })]);
    expect(calibrationRecordFrom({ entry, issues: [issue] })?.error).toBe(2);
  });
});

describe('isCalibrationRecord et mergeCalibration', () => {
  it('rejette un enregistrement abime', () => {
    expect(isCalibrationRecord(record('2026-10-04', 'high', 1))).toBe(true);
    expect(isCalibrationRecord({ ...record('2026-10-04', 'high', 1), level: 'unavailable' })).toBe(
      false,
    );
    expect(isCalibrationRecord({ ...record('2026-10-04', 'high', 1), error: -1 })).toBe(false);
    expect(isCalibrationRecord({ ...record('2026-10-04', 'high', 1), date: 'hier' })).toBe(false);
    expect(isCalibrationRecord(null)).toBe(false);
  });

  it('garde un jour une seule fois, du plus recent au plus ancien, sans depasser la limite', () => {
    const merged = mergeCalibration(
      [record('2026-10-02', 'low', 3), record('2026-10-03', 'high', 1), 'abime'],
      record('2026-10-03', 'high', 0.5),
    );
    expect(merged.map((m) => [m.date, m.error])).toEqual([
      ['2026-10-03', 0.5],
      ['2026-10-02', 3],
    ]);
    const many = Array.from({ length: CALIBRATION.maxDays + 5 }, (_, i) =>
      record(
        `2025-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
        'high',
        1,
      ),
    );
    expect(mergeCalibration(many, record('2026-10-04', 'high', 1))).toHaveLength(
      CALIBRATION.maxDays,
    );
  });
});

describe('mergeCalibration, sans enregistrement lisible', () => {
  it('part d une liste vide quand rien n est garde ou que le contenu n est pas une liste', () => {
    expect(mergeCalibration(undefined, record('2026-10-04', 'high', 1))).toHaveLength(1);
    expect(mergeCalibration('abime', record('2026-10-04', 'high', 1))).toHaveLength(1);
  });
});

describe('calibrationSummary', () => {
  const days = (level: CalibrationRecord['level'], errors: readonly number[]) =>
    errors.map((error, i) => record(`2026-09-${String(10 + i).padStart(2, '0')}`, level, error));

  it('rend null sans enregistrement', () => {
    expect(calibrationSummary([])).toBeNull();
  });

  it('donne, par niveau dit, l erreur moyenne et la part des jours dans la marge', () => {
    const summary = calibrationSummary([...days('high', [0.5, 1, 2]), ...days('low', [3, 4])]);
    expect(summary?.levels.map((l) => l.level)).toEqual(['high', 'low']);
    const high = summary?.levels[0];
    expect(high?.days).toBe(3);
    expect(high?.meanError).toBeCloseTo(3.5 / 3);
    // 0,5 et 1 sont sous 1,5 ; 2 ne l est pas.
    expect(high?.within).toBeCloseTo(2 / 3);
    expect(summary?.days).toBe(5);
  });

  it('ne dit pas que la confiance est graduee tant que chaque niveau compte trop peu de jours', () => {
    const few = calibrationSummary([...days('high', [0.5, 0.6]), ...days('low', [3, 4])]);
    expect(few?.graded).toBeNull();
  });

  it('dit si la confiance elevee a ete plus juste que la basse, une fois assez de jours', () => {
    const n = CALIBRATION.minDaysPerLevel;
    const good = calibrationSummary([
      ...days(
        'high',
        Array.from({ length: n }, () => 0.6),
      ),
      ...days(
        'low',
        Array.from({ length: n }, () => 2.5),
      ),
    ]);
    expect(good?.graded).toBe(true);
    const bad = calibrationSummary([
      ...days(
        'high',
        Array.from({ length: n }, () => 2.5),
      ),
      ...days(
        'low',
        Array.from({ length: n }, () => 0.6),
      ),
    ]);
    expect(bad?.graded).toBe(false);
  });

  it('borne la periode couverte', () => {
    const summary = calibrationSummary([
      record('2026-10-04', 'high', 1),
      record('2026-09-20', 'low', 2),
    ]);
    expect([summary?.from, summary?.to]).toEqual(['2026-09-20', '2026-10-04']);
  });
});

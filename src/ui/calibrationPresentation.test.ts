import { describe, expect, it } from 'vitest';
import type { CalibrationSummary } from '../domain/calibration';
import { calibrationHeadline, calibrationVerdict, levelLine } from './calibrationPresentation';

function summary(overrides: Partial<CalibrationSummary> = {}): CalibrationSummary {
  return {
    days: 14,
    from: '2026-09-20',
    to: '2026-10-04',
    levels: [],
    graded: null,
    ...overrides,
  };
}

describe('levelLine', () => {
  it('dit le niveau, l ecart moyen, le nombre de jours et la part dans la marge', () => {
    expect(levelLine({ level: 'high', days: 12, meanError: 0.94, within: 10 / 12 })).toBe(
      'Confiance élevée : écart moyen de 0,9 °C sur 12 jours, 83 % à moins de 1,5 °C.',
    );
  });

  it('met le jour au singulier', () => {
    expect(levelLine({ level: 'low', days: 1, meanError: 2.5, within: 0 })).toContain(
      'sur 1 jour,',
    );
  });
});

describe('calibrationVerdict', () => {
  it('ne conclut pas avant assez de jours par niveau', () => {
    expect(calibrationVerdict(summary())).toContain('Pas encore assez de jours');
  });

  it('dit que la confiance est graduee, ou qu elle ne dit rien de fiable', () => {
    expect(calibrationVerdict(summary({ graded: true }))).toContain(
      'plus juste que la confiance basse',
    );
    expect(calibrationVerdict(summary({ graded: false }))).toContain('ne dit rien de fiable');
  });
});

describe('calibrationHeadline', () => {
  it('dit depuis quand et sur combien de jours, et ce qui est compare', () => {
    expect(calibrationHeadline(summary())).toMatch(
      /^Depuis le dimanche 20 septembre 2026, 14\sjours vérifiés sur cet appareil/,
    );
  });
});

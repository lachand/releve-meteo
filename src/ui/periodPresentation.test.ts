import { describe, expect, it } from 'vitest';
import { DAY_PERIODS } from '../domain/reliability';
import type { PeriodBias } from '../domain/reliability';
import { NOTABLE_BIAS_C, periodSentence } from './periodPresentation';

function bias(values: readonly (number | null)[]): PeriodBias[] {
  return values.flatMap((value, index) =>
    value === null
      ? []
      : [{ period: DAY_PERIODS[index] as PeriodBias['period'], count: 30, bias: value }],
  );
}

describe('periodSentence', () => {
  it('nomme le modele, le sens, le moment et l ecart de chaque biais marque', () => {
    expect(periodSentence('arome', bias([-1.4, 0.2, 1.1, 0]))).toBe(
      'AROME, prévu la veille : trop froid la nuit (1,4\u00a0°C en moyenne), trop chaud l’après-midi (1,1\u00a0°C en moyenne).',
    );
  });

  it('dit l absence de biais marque plutot que de se taire', () => {
    expect(periodSentence('gfs', bias([0.3, -0.2, 0.9, 0]))).toBe(
      'GFS, prévu la veille : pas de biais marqué, quel que soit le moment de la journée.',
    );
  });

  it('ne parle pas des moments sans assez de paires', () => {
    expect(periodSentence('arpege', bias([null, null, 1.5, null]))).toBe(
      'ARPEGE, prévu la veille : trop chaud l’après-midi (1,5\u00a0°C en moyenne).',
    );
  });

  it('le seuil est inclusif', () => {
    expect(periodSentence('arome', bias([NOTABLE_BIAS_C, 0, 0, 0]))).toContain(
      'trop chaud la nuit',
    );
  });
});

import { describe, expect, it } from 'vitest';
import type { VigilanceWarning } from '../domain/vigilance';
import { bulletinTimePhrase, vigilancePeriodPhrase } from './vigilancePresentation';

// 15h27 a Paris (UTC+2).
const NOW = new Date('2026-09-28T13:27:00Z');

function warning(begin: string, end: string): VigilanceWarning {
  return {
    phenomenon: 'thunderstorm',
    level: 2,
    beginUtcMs: Date.parse(begin),
    endUtcMs: Date.parse(end),
    coastal: false,
  };
}

describe('vigilancePeriodPhrase', () => {
  it.each([
    ['2026-09-28T10:00:00Z', '2026-09-28T22:00:00Z', 'en cours, jusqu’à minuit'],
    ['2026-09-28T10:00:00Z', '2026-09-28T18:00:00Z', 'en cours, jusqu’à 20h'],
    ['2026-09-28T10:00:00Z', '2026-09-29T04:00:00Z', 'en cours, jusqu’à demain 06h'],
    ['2026-09-28T16:00:00Z', '2026-09-28T22:00:00Z', 'aujourd’hui, de 18h à minuit'],
    ['2026-09-29T04:00:00Z', '2026-09-29T16:00:00Z', 'demain, de 06h à 18h'],
    ['2026-09-28T18:00:00Z', '2026-09-29T04:00:00Z', 'd’aujourd’hui 20h à demain 06h'],
    ['2026-09-28T22:00:00Z', '2026-09-29T22:00:00Z', 'demain, toute la journée'],
    ['2026-09-29T18:00:00Z', '2026-09-30T04:00:00Z', 'de demain 20h à mercredi 06h'],
  ])('%s a %s : %s', (begin, end, phrase) => {
    expect(vigilancePeriodPhrase(warning(begin, end), NOW)).toBe(phrase);
  });
});

describe('bulletinTimePhrase', () => {
  it.each([
    ['2026-09-28T14:00:00Z', '16h'],
    ['2026-09-27T14:00:00Z', 'hier 16h'],
    ['2026-09-25T04:00:00Z', 'vendredi 06h'],
  ])('%s : %s', (issued, phrase) => {
    expect(bulletinTimePhrase(Date.parse(issued), NOW)).toBe(phrase);
  });
});

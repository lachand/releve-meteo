import { describe, expect, it } from 'vitest';
import { BULLETIN_STALE_HOURS, summarizeVigilance } from './vigilance';
import type { VigilanceBulletin, VigilancePeriod } from './vigilance';

const utc = (iso: string) => Date.parse(iso);
const NOW = new Date('2026-09-28T17:30:00Z');

function period(overrides: Partial<VigilancePeriod>): VigilancePeriod {
  return {
    phenomenon: 'thunderstorm',
    level: 1,
    beginUtcMs: utc('2026-09-28T14:00:00Z'),
    endUtcMs: utc('2026-09-28T22:00:00Z'),
    coastal: false,
    ...overrides,
  };
}

function bulletin(periods: readonly VigilancePeriod[]): VigilanceBulletin {
  return { department: '33', issuedUtcMs: utc('2026-09-28T14:00:00Z'), periods };
}

describe('summarizeVigilance', () => {
  it('reste au vert, sans avertissement, quand tout est vert', () => {
    const summary = summarizeVigilance(bulletin([period({}), period({ phenomenon: 'wind' })]), NOW);
    expect(summary).toEqual({ maxLevel: 1, warnings: [], stale: false });
  });

  it('fusionne la fin d aujourd hui et le debut de demain au meme niveau', () => {
    const summary = summarizeVigilance(
      bulletin([
        period({ level: 2, beginUtcMs: utc('2026-09-28T20:00:00Z') }),
        period({
          level: 2,
          beginUtcMs: utc('2026-09-28T22:00:00Z'),
          endUtcMs: utc('2026-09-29T04:00:00Z'),
        }),
      ]),
      NOW,
    );
    expect(summary.maxLevel).toBe(2);
    expect(summary.warnings).toEqual([
      {
        phenomenon: 'thunderstorm',
        level: 2,
        beginUtcMs: utc('2026-09-28T20:00:00Z'),
        endUtcMs: utc('2026-09-29T04:00:00Z'),
        coastal: false,
      },
    ]);
  });

  it('ecarte les periodes terminees et classe les plus fortes d abord', () => {
    const summary = summarizeVigilance(
      bulletin([
        // Terminee a 16 h UTC : ignoree, meme orange.
        period({ level: 3, endUtcMs: utc('2026-09-28T16:00:00Z') }),
        period({
          phenomenon: 'rain',
          level: 2,
          beginUtcMs: utc('2026-09-29T16:00:00Z'),
          endUtcMs: utc('2026-09-29T22:00:00Z'),
        }),
        period({
          phenomenon: 'wind',
          level: 3,
          beginUtcMs: utc('2026-09-29T18:00:00Z'),
          endUtcMs: utc('2026-09-29T22:00:00Z'),
        }),
        period({ phenomenon: 'waves', level: 2, coastal: true }),
      ]),
      NOW,
    );
    expect(summary.maxLevel).toBe(3);
    expect(summary.warnings.map((w) => [w.phenomenon, w.level])).toEqual([
      ['wind', 3],
      ['waves', 2],
      ['rain', 2],
    ]);
  });

  it('ne fusionne ni deux niveaux differents ni deux periodes disjointes', () => {
    const summary = summarizeVigilance(
      bulletin([
        period({ level: 2, endUtcMs: utc('2026-09-28T20:00:00Z') }),
        period({ level: 3, beginUtcMs: utc('2026-09-28T20:00:00Z') }),
        period({
          level: 2,
          beginUtcMs: utc('2026-09-29T06:00:00Z'),
          endUtcMs: utc('2026-09-29T10:00:00Z'),
        }),
      ]),
      NOW,
    );
    expect(summary.warnings).toHaveLength(3);
  });

  it(`signale un bulletin emis il y a plus de ${BULLETIN_STALE_HOURS} h`, () => {
    const old = {
      ...bulletin([period({ endUtcMs: utc('2026-10-01T00:00:00Z') })]),
      issuedUtcMs: utc('2026-09-27T08:00:00Z'),
    };
    expect(summarizeVigilance(old, NOW).stale).toBe(true);
  });
});

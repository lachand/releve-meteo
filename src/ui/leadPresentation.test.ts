import { describe, expect, it } from 'vitest';
import type { LeadScores } from '../domain/leadScores';
import { collectingSentence, leadHeadline } from './leadPresentation';

function scores(overrides: Partial<LeadScores> = {}): LeadScores {
  return {
    buckets: [
      {
        label: '1 h',
        from: 1,
        to: 1,
        models: [{ model: 'arome', pairs: 14, bias: 0.2, mae: 0.6 }],
      },
      { label: '3 h', from: 2, to: 3, models: [] },
      {
        label: '6 h',
        from: 4,
        to: 6,
        models: [
          { model: 'gfs', pairs: 9, bias: -0.8, mae: 1.04 },
          { model: 'arome', pairs: 9, bias: 1.5, mae: 1.5 },
        ],
      },
      { label: '12 h', from: 7, to: 12, models: [] },
    ],
    snapshots: 30,
    oldestIssuedAt: '2026-09-27T08:00',
    ready: true,
    ...overrides,
  };
}

describe('leadHeadline', () => {
  it('nomme le modele le plus juste de chaque echeance notee, et tait les autres', () => {
    expect(leadHeadline(scores())).toBe(
      'Le plus juste à 1 h : AROME (0,6\u00a0°C d’erreur moyenne) ; à 6 h : GFS (1,0\u00a0°C).',
    );
  });
});

describe('collectingSentence', () => {
  it('dit ce qui est collecte et ce qu il faut encore', () => {
    const text = collectingSentence(
      scores({ ready: false, snapshots: 3, oldestIssuedAt: '2026-09-28T08:00' }),
    );
    expect(text).toContain('3 prévisions enregistrées depuis lundi 08h');
    expect(text).toContain('6 heures comparables');
    expect(text).toContain('quand elle est ouverte');
  });

  it('avoue qu il n y a rien encore', () => {
    expect(
      collectingSentence(scores({ ready: false, snapshots: 0, oldestIssuedAt: null })),
    ).toContain('Aucune prévision enregistrée');
  });

  it('accorde le singulier', () => {
    expect(
      collectingSentence(
        scores({ ready: false, snapshots: 1, oldestIssuedAt: '2026-09-28T08:00' }),
      ),
    ).toContain('1 prévision enregistrée depuis');
  });
});

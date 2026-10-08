import { describe, expect, it } from 'vitest';
import type { DayDrift, Drift } from '../domain/forecastDrift';
import { dayDriftSentence, driftHeadline, sinceLabel } from './driftPresentation';

// Samedi 3 octobre 2026, 21 h 30 a Paris.
const NOW = new Date('2026-10-03T19:30:00Z');
const HOUR = 60 * 60 * 1000;

function drift(overrides: Partial<DayDrift> = {}): DayDrift {
  return {
    date: '2026-10-04',
    tempMax: { before: 18, now: 21, delta: 3 },
    tempMin: { before: 8, now: 8, delta: 0 },
    rain: { before: 0.4, now: 6, delta: 5.6 },
    modelBefore: 'arome',
    modelNow: 'arome',
    modelChanged: false,
    fields: ['tempMax', 'rain'],
    moved: true,
    ...overrides,
  };
}

describe('sinceLabel', () => {
  it('dit hier, aujourd hui ou le jour de la semaine, avec l heure locale', () => {
    expect(sinceLabel(NOW.getTime() - 24 * HOUR, NOW)).toBe('hier à 21h30');
    expect(sinceLabel(NOW.getTime() - 2 * HOUR, NOW)).toBe('aujourd’hui à 19h30');
    expect(sinceLabel(NOW.getTime() - 48 * HOUR, NOW)).toBe('jeudi à 21h30');
  });
});

describe('dayDriftSentence', () => {
  it('dit les seules grandeurs qui ont bouge, avec de combien et la valeur annoncee', () => {
    expect(dayDriftSentence(drift())).toBe(
      'dimanche : maximum 21 °C (+3 °C, 18 °C annoncés), pluie 6 mm (+5,6 mm, 0,4 mm annoncés)',
    );
  });

  it('met un moins typographique pour une baisse', () => {
    expect(
      dayDriftSentence(
        drift({ tempMin: { before: 9, now: 5, delta: -4 }, fields: ['tempMin'], rain: null }),
      ),
    ).toBe('dimanche : minimum 5 °C (−4 °C, 9 °C annoncés)');
  });

  it('nomme le changement de modele, qui peut expliquer l ecart', () => {
    expect(
      dayDriftSentence(drift({ modelChanged: true, modelBefore: 'arome', modelNow: 'arpege' })),
    ).toContain('d’un autre modèle (AROME avant, ARPEGE maintenant)');
  });
});

describe('driftHeadline', () => {
  const since = NOW.getTime() - 24 * HOUR;

  it('dit combien de jours ont bouge, depuis quelle prevision', () => {
    expect(driftHeadline({ since, days: [drift()], moved: [drift()] }, NOW)).toBe(
      '1 jour a bougé depuis la prévision gardée hier à 21h30.',
    );
    expect(
      driftHeadline({ since, days: [drift(), drift()], moved: [drift(), drift()] }, NOW),
    ).toContain('2 jours ont bougé');
  });

  it('dit la stabilite avec les seuils, jamais un silence', () => {
    const stable = drift({ fields: [], moved: false });
    const result: Drift = { since, days: [stable], moved: [] };
    expect(driftHeadline(result, NOW)).toBe(
      'Prévision stable depuis hier à 21h30 : aucun jour ne bouge d’au moins 2 °C ou 2 mm, ni du sec au mouillé.',
    );
  });

  it('dit quand rien n est comparable', () => {
    expect(driftHeadline({ since, days: [], moved: [] }, NOW)).toContain('Aucun jour à comparer');
  });
});

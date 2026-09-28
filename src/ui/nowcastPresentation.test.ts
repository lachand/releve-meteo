import { describe, expect, it } from 'vitest';
import type { NowcastSummary } from '../domain/nowcast';
import { nowcastSentence } from './nowcastPresentation';

describe('nowcastSentence', () => {
  it('signale l indisponibilite du nowcast', () => {
    const summary: NowcastSummary = { kind: 'unavailable' };
    expect(nowcastSentence(summary)).toBe('Pluie à courte échéance indisponible.');
  });

  it('annonce une periode seche jusqu a l horizon, arrondi au quart d heure', () => {
    const summary: NowcastSummary = { kind: 'dry', horizonMinutes: 125 };
    expect(nowcastSentence(summary)).toBe('Pas de pluie attendue d’ici 2 h.');
  });

  it('annonce une pluie a venir dans un delai', () => {
    const summary: NowcastSummary = { kind: 'starting', inMinutes: 25, peakMm: 1.4 };
    expect(nowcastSentence(summary)).toBe('Pluie dans 25 min, jusqu’à 1,4 mm par quart d’heure.');
  });

  it('annonce une pluie qui commence maintenant (delai nul ou negatif)', () => {
    const summary: NowcastSummary = { kind: 'starting', inMinutes: 0, peakMm: 0.8 };
    expect(nowcastSentence(summary)).toBe('La pluie commence, jusqu’à 0,8 mm par quart d’heure.');
  });

  it('annonce une pluie en cours sans accalmie identifiee sur deux heures', () => {
    const summary: NowcastSummary = { kind: 'ongoing', stopsInMinutes: null, peakMm: 2.1 };
    expect(nowcastSentence(summary)).toBe(
      'Il pleut, sans accalmie annoncée sur deux heures (jusqu’à 2,1 mm par quart d’heure).',
    );
  });

  it('annonce la fin prevue d une pluie en cours', () => {
    const summary: NowcastSummary = { kind: 'ongoing', stopsInMinutes: 40, peakMm: 1.9 };
    expect(nowcastSentence(summary)).toBe('Il pleut ; fin prévue dans 40 min.');
  });
});

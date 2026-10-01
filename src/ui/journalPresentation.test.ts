import { describe, expect, it } from 'vitest';
import type { JournalSummary } from '../domain/journal';
import { journalErrorLine, journalHeadline } from './journalPresentation';

const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

const SUMMARY: JournalSummary = {
  days: 18,
  from: '2026-09-12',
  to: '2026-09-29',
  leaders: [
    { model: 'icon_d2', wins: 9 },
    { model: 'arome_france', wins: 5 },
    { model: 'arome', wins: 3 },
    { model: 'gfs', wins: 1 },
  ],
  meanMae: [{ model: 'icon_d2', mae: 1.15, days: 18 }],
};

describe('journalHeadline', () => {
  it('nomme le modele le plus souvent le plus proche et les deux suivants, avec ce que le journal compte', () => {
    expect(plain(journalHeadline(SUMMARY))).toBe(
      'Depuis le samedi 12 septembre 2026, 18 jours de bilan gardés sur cet appareil : ICON-D2 a été le plus proche de la mesure 9 jours, AROME France 5, AROME 3.',
    );
  });

  it('dit un jour au singulier, et un seul modele sans liste de suivants', () => {
    const text = plain(
      journalHeadline({ ...SUMMARY, days: 1, leaders: [{ model: 'arome', wins: 1 }] }),
    );
    expect(text).toContain('1 jour de bilan gardés');
    expect(text).toContain('AROME a été le plus proche de la mesure 1 jour.');
  });

  it('reste honnete sans modele comparable', () => {
    expect(plain(journalHeadline({ ...SUMMARY, days: 2, leaders: [] }))).toBe(
      '2 jours de bilan gardés sur cet appareil, sans modèle comparable.',
    );
  });
});

describe('journalErrorLine', () => {
  it('dit l erreur moyenne et sur combien de jours', () => {
    expect(plain(journalErrorLine(1.15, 18))).toBe('1,2 °C d’erreur moyenne sur 18 jours');
    expect(plain(journalErrorLine(0.9, 1))).toBe('0,9 °C d’erreur moyenne sur 1 jour');
  });
});

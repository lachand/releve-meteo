import { describe, expect, it } from 'vitest';
import type { WeekLeader, WeeklyComparison } from '../domain/reliability';
import { weeklySentence } from './historyPresentation';

const AROME: WeekLeader = { model: 'arome', mae: 0.8, days: 7 };
const ARPEGE: WeekLeader = { model: 'arpege', mae: 1.1, days: 6 };

function comparison(recent: WeekLeader | null, previous: WeekLeader | null): WeeklyComparison {
  return { lastDate: '2026-09-28', recent, previous };
}

const plain = (text: string) => text.replace(/\u00a0/g, ' ');

describe('weeklySentence', () => {
  it('dit quand le classement a change', () => {
    const text = plain(weeklySentence(comparison(AROME, ARPEGE)));
    expect(text).toContain('Ces 7 derniers jours (jusqu’au 28 septembre)');
    expect(text).toContain('AROME (0,8 °C d’erreur moyenne) a été le plus juste');
    expect(text).toContain('les 7 jours d’avant, ARPEGE (1,1 °C d’erreur moyenne)');
    expect(text).toContain('Le classement a changé.');
  });

  it('dit quand le meme modele reste le plus juste', () => {
    const text = plain(weeklySentence(comparison(AROME, { ...AROME, mae: 1.3 })));
    expect(text).toContain('AROME a été le plus juste ces 7 derniers jours');
    expect(text).toContain('comme les 7 jours d’avant : 0,8 °C d’erreur moyenne, contre 1,3 °C.');
  });

  it('ne compare pas quand une semaine manque', () => {
    expect(plain(weeklySentence(comparison(AROME, null)))).toContain(
      'ne remonte pas assez loin pour comparer',
    );
    const text = plain(weeklySentence(comparison(null, ARPEGE)));
    expect(text).toContain('Les 7 derniers jours n’ont pas assez de mesures');
    expect(text).toContain('c’était ARPEGE (1,1 °C d’erreur moyenne)');
  });

  it('rend un texte vide si aucune semaine n a de designe', () => {
    expect(weeklySentence(comparison(null, null))).toBe('');
  });
});

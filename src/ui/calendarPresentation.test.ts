import { describe, expect, it } from 'vitest';
import type { DayLeader } from '../domain/reliability';
import { CALENDAR_DAYS, calendarCells, cellSentence, leaderTally } from './calendarPresentation';

const plain = (text: string) => text.replace(/\u00a0/g, ' ');

function leader(date: string, model: DayLeader['model'], mae = 1, lead = 0.4): DayLeader {
  return { date, model, mae, lead, compared: 4 };
}

describe('calendarCells', () => {
  it('couvre les 30 derniers jours jusqu a la date la plus recente, et debute un lundi', () => {
    const { cells, offset } = calendarCells([
      leader('2026-09-20', 'arome'),
      leader('2026-09-28', 'arpege'),
    ]);
    expect(cells).toHaveLength(CALENDAR_DAYS);
    expect(cells[0]?.date).toBe('2026-08-30');
    expect(cells.at(-1)?.date).toBe('2026-09-28');
    // Le 30 aout 2026 est un dimanche : six cases vides avant lui.
    expect(offset).toBe(6);
    expect(cells.find((c) => c.date === '2026-09-20')?.leader?.model).toBe('arome');
    // Un jour sans donnee reste vide, jamais un modele invente.
    expect(cells.find((c) => c.date === '2026-09-21')?.leader).toBeNull();
    expect(cells.find((c) => c.date === '2026-09-05')?.day).toBe(5);
  });

  it('traverse un changement de mois et d annee', () => {
    const { cells } = calendarCells([leader('2027-01-05', 'gfs')]);
    expect(cells[0]?.date).toBe('2026-12-07');
    expect(cells.find((c) => c.date === '2027-01-01')?.day).toBe(1);
  });

  it('ne trace rien sans aucun jour', () => {
    expect(calendarCells([])).toEqual({ cells: [], offset: 0 });
  });
});

describe('cellSentence', () => {
  it('dit le modele, son erreur, son avance et le nombre de modeles compares', () => {
    expect(
      plain(
        cellSentence({
          date: '2026-09-26',
          day: 26,
          leader: leader('2026-09-26', 'arpege', 0.5, 0.4),
        }),
      ),
    ).toBe(
      '26 septembre : ARPEGE le plus juste (0,5 °C d’erreur), 0,4 °C devant le suivant, 4 modèles comparés.',
    );
  });

  it('dit l egalite, et l absence de donnees', () => {
    expect(
      plain(
        cellSentence({ date: '2026-09-26', day: 26, leader: leader('2026-09-26', 'arome', 1, 0) }),
      ),
    ).toContain('à égalité avec le suivant');
    expect(cellSentence({ date: '2026-09-26', day: 26, leader: null })).toBe(
      '26 septembre : pas assez de mesures pour désigner le plus juste.',
    );
  });
});

describe('leaderTally', () => {
  it('compte les jours gagnes par chaque modele, du plus frequent au moins frequent', () => {
    const { cells } = calendarCells([
      leader('2026-09-26', 'arome'),
      leader('2026-09-27', 'arpege'),
      leader('2026-09-28', 'arome'),
    ]);
    expect(leaderTally(cells)).toEqual([
      { model: 'arome', days: 2 },
      { model: 'arpege', days: 1 },
    ]);
    expect(leaderTally([])).toEqual([]);
  });
});

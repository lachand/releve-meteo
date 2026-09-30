import { describe, expect, it } from 'vitest';
import type { IndexCriterion, PracticalIndices } from '../domain/practicalIndices';
import { criterionSentence, windowSentence } from './practicalPresentation';

function criterion(overrides: Partial<IndexCriterion>): IndexCriterion {
  return {
    key: 'rain',
    value: 1.5,
    kind: 'max',
    good: 0.5,
    fair: 2,
    status: 'fair',
    ...overrides,
  };
}

describe('criterionSentence', () => {
  it('dit la valeur lue et les deux seuils d un critere a plafond', () => {
    expect(criterionSentence(criterion({}), 'kmh')).toBe(
      'Pluie cumulée : 1,5\u00a0mm (favorable jusqu’à 0,5\u00a0mm, passable jusqu’à 2\u00a0mm).',
    );
  });

  it('dit « dès » pour un critere a plancher', () => {
    expect(
      criterionSentence(
        criterion({ key: 'tempMin', value: 4, kind: 'min', good: 8, fair: 2 }),
        'kmh',
      ),
    ).toBe(
      'Température la plus basse : 4\u00a0°C (favorable dès 8\u00a0°C, passable dès 2\u00a0°C).',
    );
  });

  it('convertit le vent dans l unite choisie', () => {
    expect(
      criterionSentence(criterion({ key: 'gust', value: 37.04, good: 30, fair: 45 }), 'kt'),
    ).toBe(
      'Rafale maximale : 20\u00a0kt (favorable jusqu’à 16\u00a0kt, passable jusqu’à 24\u00a0kt).',
    );
  });

  it('avoue une valeur inconnue plutot que de la remplacer', () => {
    expect(criterionSentence(criterion({ value: null, status: 'unknown' }), 'kmh')).toBe(
      'Pluie cumulée : inconnue, au moins une heure sans valeur (favorable jusqu’à 0,5\u00a0mm, passable jusqu’à 2\u00a0mm).',
    );
  });

  it('nomme l humidite en pourcentage', () => {
    expect(
      criterionSentence(criterion({ key: 'humidity', value: 72.4, good: 70, fair: 85 }), 'kmh'),
    ).toContain('Humidité moyenne : 72\u00a0%');
  });
});

describe('windowSentence', () => {
  const base: PracticalIndices = {
    day: 'today',
    start: '2026-09-28T10:00',
    end: '2026-09-28T20:00',
    hours: 10,
    models: ['arome', 'gfs'],
    indices: [],
  };

  it('dit les heures jugees, leur nombre et les modeles', () => {
    expect(windowSentence(base)).toBe(
      'Jugé sur les heures de jour d’aujourd’hui, de 10h à 20h (10 h), selon AROME, puis GFS.',
    );
  });

  it('dit demain quand il ne reste plus assez de jour aujourd hui', () => {
    expect(windowSentence({ ...base, day: 'tomorrow', models: ['arome'] })).toContain(
      'heures de jour de demain',
    );
  });
});

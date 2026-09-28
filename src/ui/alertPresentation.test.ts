import { describe, expect, it } from 'vitest';
import type { AlertHit } from '../domain/alerts';
import type { AlertRule } from '../domain/types';
import { alertUnit, hitSentence, ruleSentence } from './alertPresentation';
import { toKmh } from './windUnit';

const gusts: AlertRule = {
  id: 'vent',
  placeId: 'lyon',
  variable: 'wind',
  comparator: 'gt',
  threshold: 60,
  enabled: true,
};

describe('ruleSentence', () => {
  it('dit la regle en une phrase, dans l unite choisie', () => {
    expect(ruleSentence(gusts, 'kmh')).toBe('Rafales au-dessus de 60\u00a0km/h');
    expect(ruleSentence(gusts, 'kt')).toBe('Rafales au-dessus de 32,4\u00a0kt');
    expect(
      ruleSentence({ ...gusts, variable: 'temperature', comparator: 'lt', threshold: -1.5 }, 'kmh'),
    ).toBe('Température sous -1,5\u00a0°C');
    expect(alertUnit('precipitation', 'kt')).toBe('mm');
  });
});

describe('hitSentence', () => {
  const hit: AlertHit = {
    rule: gusts,
    first: { time: '2026-09-29T06:00', value: 64, model: 'arpege' },
    extreme: { time: '2026-09-29T07:00', value: 71, model: 'arpege' },
    hours: 2,
  };

  it('dit quand, jusqu ou et selon quel modele', () => {
    expect(hitSentence(hit, 'kmh')).toBe(
      'dès mardi 06h, jusqu’à 71\u00a0km/h mardi 07h selon ARPEGE, 2\u00a0h au total',
    );
  });

  it('abrege quand le seuil n est franchi qu une heure', () => {
    expect(hitSentence({ ...hit, extreme: hit.first, hours: 1 }, 'kmh')).toBe(
      'dès mardi 06h, 64\u00a0km/h selon ARPEGE, une heure',
    );
  });
});

describe('toKmh', () => {
  it('ramene une saisie en noeuds vers les km/h du domaine', () => {
    expect(toKmh(10, 'kt')).toBeCloseTo(18.52, 5);
    expect(toKmh(10, 'kmh')).toBe(10);
  });
});

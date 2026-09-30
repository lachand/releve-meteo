import { describe, expect, it } from 'vitest';
import type { DryWindow } from '../domain/dryWindow';
import { dryWindowSentence } from './dryWindowPresentation';

describe('dryWindowSentence', () => {
  it('annonce la plus longue fenetre, sa duree et le modele', () => {
    const window: DryWindow = {
      status: 'window',
      start: '2026-09-28T14:00',
      end: '2026-09-28T18:00',
      hours: 4,
      models: ['arome'],
    };
    expect(dryWindowSentence(window)).toBe(
      'Meilleur créneau sec : de 14h à 18h (4 h), selon AROME.',
    );
  });

  it('dit sec toute la fin de journee, et nomme les modeles qui se relaient', () => {
    const window: DryWindow = {
      status: 'all-day',
      start: '2026-09-28T10:00',
      end: '2026-09-28T20:00',
      hours: 10,
      models: ['arome', 'icon_eu'],
    };
    expect(dryWindowSentence(window)).toBe(
      'Sec jusqu’à la nuit, de 10h à 20h, selon AROME, puis ICON-EU.',
    );
  });

  it('accorde une fenetre d une seule heure minute : jamais annoncee, mais phrase sure', () => {
    const window: DryWindow = {
      status: 'window',
      start: '2026-09-28T14:00',
      end: '2026-09-28T15:00',
      hours: 1,
      models: ['gfs'],
    };
    expect(dryWindowSentence(window)).toBe('Meilleur créneau sec : de 14h à 15h (1 h), selon GFS.');
  });

  it('dit qu il n y a pas de creneau sec plutot que de se taire', () => {
    expect(dryWindowSentence({ status: 'none', reason: 'wet-or-windy' })).toBe(
      'Pas de créneau sec de 2 heures d’ici ce soir : pluie ou rafales.',
    );
  });
});

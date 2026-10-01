import { describe, expect, it } from 'vitest';
import type { RainCheck } from '../domain/rainCheck';
import {
  forecastRainSentence,
  observedRainSentence,
  rainVerdictSentence,
} from './rainPresentation';

const check: RainCheck = {
  model: 'arome',
  paired: 23,
  missing: 1,
  observedMm: 3.2,
  forecastMm: 4.1,
};
const plain = (text: string) => text.replace(/\u00a0/g, ' ');

describe('observedRainSentence', () => {
  it('dit le cumul mesure, la station et sa distance, avec l heure sans mesure', () => {
    expect(plain(observedRainSentence(check, 'Lyon / Bron', 9))).toBe(
      'Mesuré à la station Lyon / Bron (9 km) : 3,2 mm sur les 24 dernières heures (1 h sans mesure, non comptée).',
    );
  });

  it('accorde le pluriel, et se tait quand rien ne manque', () => {
    expect(plain(observedRainSentence({ ...check, missing: 3 }, 'Lyon', 9.5))).toContain(
      '(3 h sans mesure, non comptées)',
    );
    expect(plain(observedRainSentence({ ...check, missing: 0 }, 'Lyon', 9))).not.toContain(
      'sans mesure',
    );
  });
});

describe('forecastRainSentence', () => {
  it('nomme le modele, son execution et les heures comparees', () => {
    expect(plain(forecastRainSentence(check))).toBe(
      'Calculé au lieu par AROME, dans sa dernière exécution : 4,1 mm sur les mêmes 23 heures.',
    );
  });
});

describe('rainVerdictSentence', () => {
  it('dit le sens et la taille de l ecart', () => {
    expect(plain(rainVerdictSentence(check))).toBe('AROME voyait 0,9 mm de plus que la station.');
    expect(plain(rainVerdictSentence({ ...check, forecastMm: 1.2 }))).toBe(
      'AROME voyait 2,0 mm de moins que la station.',
    );
  });

  it('dit quand c est a peu pres pareil, ou quand il n a pas plu', () => {
    expect(rainVerdictSentence({ ...check, forecastMm: 3.4 })).toBe(
      'À peu près la même quantité des deux côtés.',
    );
    expect(rainVerdictSentence({ ...check, observedMm: 0, forecastMm: 0 })).toBe(
      'Ni la station ni le modèle n’ont vu de pluie.',
    );
  });
});

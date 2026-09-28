import { describe, expect, it } from 'vitest';
import { plotSides, plotWidth } from './plotLayout';

describe('plotSides', () => {
  it('pose les etiquettes a droite quand elles ne se chevauchent pas', () => {
    const sides = plotSides([
      { id: 'brest', x: 100, y: 100, w: 110 },
      { id: 'lyon', x: 400, y: 300, w: 110 },
    ]);
    expect([...sides]).toEqual([
      ['brest', 'right'],
      ['lyon', 'right'],
    ]);
  });

  it('bascule a gauche une etiquette qui chevaucherait sa voisine du nord', () => {
    // Chamonix, au nord-est de Lyon et tout proche : son etiquette part a
    // droite ; celle de Lyon chevaucherait, elle passe a gauche.
    const sides = plotSides([
      { id: 'lyon', x: 400, y: 310, w: 110 },
      { id: 'chamonix', x: 450, y: 300, w: 180 },
    ]);
    expect(sides.get('chamonix')).toBe('right');
    expect(sides.get('lyon')).toBe('left');
  });

  it('garde la droite quand la gauche est prise aussi', () => {
    const sides = plotSides([
      { id: 'a', x: 400, y: 300, w: 110 },
      { id: 'b', x: 300, y: 305, w: 110 },
      { id: 'c', x: 350, y: 310, w: 110 },
    ]);
    expect(sides.get('c')).toBe('right');
  });
});

describe('plotSides, bord de carte', () => {
  it('bascule a gauche une etiquette qui sortirait de la carte par la droite', () => {
    const sides = plotSides([{ id: 'strasbourg', x: 600, y: 200, w: 110 }], 640);
    expect(sides.get('strasbourg')).toBe('left');
  });

  it('garde la droite si la gauche sortirait aussi de la carte', () => {
    const sides = plotSides([{ id: 'etroit', x: 50, y: 200, w: 110 }], 120);
    expect(sides.get('etroit')).toBe('right');
  });
});

describe('plotWidth', () => {
  it('grandit avec la longueur du nom, alias compris, avec un minimum', () => {
    const base = { id: 'x', latitude: 0, longitude: 0, elevation: 0, admin: null };
    expect(plotWidth({ ...base, name: 'Ay', alias: null })).toBe(96);
    expect(plotWidth({ ...base, name: 'Chamonix-Mont-Blanc', alias: null })).toBeGreaterThan(170);
    expect(plotWidth({ ...base, name: 'Chamonix-Mont-Blanc', alias: 'Cham' })).toBe(
      plotWidth({ ...base, name: 'Cham', alias: null }),
    );
    // Compacte : largeur fixe, quel que soit le nom.
    expect(plotWidth({ ...base, name: 'Chamonix-Mont-Blanc', alias: null }, true)).toBe(72);
  });
});

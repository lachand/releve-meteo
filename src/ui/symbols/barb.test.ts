import { describe, expect, it } from 'vitest';
import { KMH_PER_KNOT, barbParts } from './barb';

function fromKnots(knots: number): number {
  return knots * KMH_PER_KNOT;
}

describe('barbParts', () => {
  it('est calme sous 3 noeuds', () => {
    expect(barbParts(0)).toEqual({ pennants: 0, full: 0, half: 0, calm: true });
    expect(barbParts(fromKnots(2.9))).toEqual({ pennants: 0, full: 0, half: 0, calm: true });
  });

  it('n est plus calme a partir de 3 noeuds, arrondis a 5 (au moins une demi-barbule)', () => {
    expect(barbParts(fromKnots(3))).toEqual({ pennants: 0, full: 0, half: 1, calm: false });
  });

  it('arrondit au multiple de 5 noeuds le plus proche', () => {
    // 12 kt arrondit a 10 (une barbule pleine, pas de demie).
    expect(barbParts(fromKnots(12))).toEqual({ pennants: 0, full: 1, half: 0, calm: false });
    // 13 kt arrondit a 15 (une barbule pleine et une demie).
    expect(barbParts(fromKnots(13))).toEqual({ pennants: 0, full: 1, half: 1, calm: false });
  });

  it('decompose 65 noeuds en un fanion, une barbule pleine et une demi-barbule', () => {
    expect(barbParts(fromKnots(65))).toEqual({ pennants: 1, full: 1, half: 1, calm: false });
  });

  it('decompose un vent fort en plusieurs fanions', () => {
    // 105 kt = 2 fanions (100) + une demi-barbule (5), pas de barbule pleine.
    expect(barbParts(fromKnots(105))).toEqual({ pennants: 2, full: 0, half: 1, calm: false });
  });
});

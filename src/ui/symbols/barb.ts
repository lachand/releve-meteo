/*
 * Decomposition d'une vitesse de vent en elements de barbule synoptique :
 * fanion 50 noeuds, barbule 10 noeuds, demi-barbule 5 noeuds. Vent calme
 * sous 3 noeuds.
 */

export const KMH_PER_KNOT = 1.852;

export interface BarbParts {
  readonly pennants: number;
  readonly full: number;
  readonly half: number;
  readonly calm: boolean;
}

/** Decomposition arrondie aux 5 noeuds les plus proches (au moins 5 hors calme). */
export function barbParts(speedKmh: number): BarbParts {
  const knots = speedKmh / KMH_PER_KNOT;
  if (knots < 3) {
    return { pennants: 0, full: 0, half: 0, calm: true };
  }
  let rest = Math.max(5, Math.round(knots / 5) * 5);
  const pennants = Math.floor(rest / 50);
  rest -= pennants * 50;
  const full = Math.floor(rest / 10);
  rest -= full * 10;
  return { pennants, full, half: rest >= 5 ? 1 : 0, calm: false };
}

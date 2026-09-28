/** Force du vent pour le dessin de la fleche (WindArrow). */

/** Seuils de force, km/h : faible, modere, fort, tres fort. */
export const WIND_STRENGTH_KMH = [20, 40, 60] as const;

export type WindStrength = 'calm' | 'light' | 'moderate' | 'strong' | 'veryStrong';

const CALM_KMH = 5;

export function windStrength(speedKmh: number): WindStrength {
  if (speedKmh < CALM_KMH) {
    return 'calm';
  }
  const [moderate, strong, veryStrong] = WIND_STRENGTH_KMH;
  if (speedKmh < moderate) {
    return 'light';
  }
  if (speedKmh < strong) {
    return 'moderate';
  }
  return speedKmh < veryStrong ? 'strong' : 'veryStrong';
}

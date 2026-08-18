import type { Preferences } from '../domain/types';

type WindUnit = Preferences['units']['wind'];

const KMH_PER_KNOT = 1.852;

/** Convertit une vitesse de vent en km/h (unite du domaine) vers l'unite d'affichage choisie. */
export function convertWindSpeed(kmh: number | null, unit: WindUnit): number | null {
  if (kmh === null) {
    return null;
  }
  return unit === 'kt' ? kmh / KMH_PER_KNOT : kmh;
}

export function windUnitLabel(unit: WindUnit): string {
  return unit === 'kt' ? 'kt' : 'km/h';
}

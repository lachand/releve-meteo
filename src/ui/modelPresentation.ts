import { MODEL_SPECS } from '../domain/models';
import type { ConfidenceLevel, ModelId, TerrainKind } from '../domain/types';

export { MODEL_LABELS } from './modelLabels';

export const MODEL_COLOR_VARS: Readonly<Record<ModelId, string>> = {
  arome: '--arome',
  arome_france: '--arome-france',
  icon_d2: '--icon-d2',
  arpege: '--arpege',
  icon_eu: '--icon-eu',
  ecmwf: '--ecmwf',
  gfs: '--gfs',
};

/** Maille native, texte affiche : « 1,3 km ». */
export function modelResolution(model: ModelId): string {
  return `${new Intl.NumberFormat('fr-FR').format(MODEL_SPECS[model].resolutionKm)} km`;
}

export function modelProducer(model: ModelId): string {
  return MODEL_SPECS[model].producer;
}

// AGENTS.md : messages utilisateur en francais. ConfidenceLevel est un
// identifiant de domaine, jamais affiche tel quel.
export const CONFIDENCE_LEVEL_LABELS: Readonly<Record<ConfidenceLevel, string>> = {
  high: 'Élevée',
  medium: 'Moyenne',
  low: 'Faible',
  unavailable: 'Indisponible',
};

// DESIGN.md maquette 6.2 : le fil "Nom . Departement . Altitude . Terrain".
export const TERRAIN_KIND_LABELS: Readonly<Record<TerrainKind, string>> = {
  coastal: 'côtier',
  mountain: 'montagne',
  plateau: 'plateau',
  plain: 'plaine',
};

/** Lit une variable CSS resolue (respecte le theme clair/sombre actif). */
export function cssVar(name: string): string {
  if (typeof document === 'undefined') {
    return '';
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function modelColor(model: ModelId): string {
  return cssVar(MODEL_COLOR_VARS[model]);
}

/** Couleur CSS utilisable dans un attribut style, resolue par le navigateur. */
export function modelColorVar(model: ModelId): string {
  return `var(${MODEL_COLOR_VARS[model]})`;
}

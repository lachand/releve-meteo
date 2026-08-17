import type { ConfidenceLevel, ModelId } from '../domain/types';

// DESIGN.md section 7 : "AROME", "ARPEGE", "ICON-EU", "GFS" sont conserves
// tels quels, jamais traduits ni vulgarises.
export const MODEL_LABELS: Readonly<Record<ModelId, string>> = {
  arome: 'AROME',
  arpege: 'ARPEGE',
  icon_eu: 'ICON-EU',
  gfs: 'GFS',
};

export const MODEL_COLOR_VARS: Readonly<Record<ModelId, string>> = {
  arome: '--arome',
  arpege: '--arpege',
  icon_eu: '--icon-eu',
  gfs: '--gfs',
};

export const MODEL_PRODUCERS: Readonly<Record<ModelId, string>> = {
  arome: 'Météo-France',
  arpege: 'Météo-France',
  icon_eu: 'DWD',
  gfs: 'NOAA',
};

/** Resolution native approximative, pour le contexte affiche a l'utilisateur. */
export const MODEL_RESOLUTIONS: Readonly<Record<ModelId, string>> = {
  arome: '1,3 km',
  arpege: '10 km',
  icon_eu: '13 km',
  gfs: '25 km',
};

// AGENTS.md : messages utilisateur en francais. ConfidenceLevel est un
// identifiant de domaine ('high'|'medium'|'low'|'unavailable'), jamais
// affiche tel quel.
export const CONFIDENCE_LEVEL_LABELS: Readonly<Record<ConfidenceLevel, string>> = {
  high: 'Élevée',
  medium: 'Moyenne',
  low: 'Faible',
  unavailable: 'Indisponible',
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

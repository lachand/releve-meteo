import type { ModelId } from '../domain/types';

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

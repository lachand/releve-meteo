import { MODEL_SPECS } from '../domain/models';
import type { ModelId } from '../domain/types';

// DESIGN.md section 7 : les noms de modele sont conserves tels quels,
// jamais traduits ni vulgarises. Source unique : le catalogue du domaine.
export const MODEL_LABELS: Readonly<Record<ModelId, string>> = {
  arome: MODEL_SPECS.arome.label,
  arome_france: MODEL_SPECS.arome_france.label,
  icon_d2: MODEL_SPECS.icon_d2.label,
  arpege: MODEL_SPECS.arpege.label,
  icon_eu: MODEL_SPECS.icon_eu.label,
  ecmwf: MODEL_SPECS.ecmwf.label,
  gfs: MODEL_SPECS.gfs.label,
};

/** Code de deux lettres pour une cellule etroite ; toujours accompagne du nom complet. */
export const MODEL_CODES: Readonly<Record<ModelId, string>> = {
  arome: 'AR',
  arome_france: 'AF',
  icon_d2: 'D2',
  arpege: 'AP',
  icon_eu: 'EU',
  ecmwf: 'EC',
  gfs: 'GF',
};

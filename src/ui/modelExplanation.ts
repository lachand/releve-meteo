import { CASCADE_BOUNDS_HOURS } from '../domain/constants';
import type { ModelId } from '../domain/types';
import { MODEL_LABELS } from './modelPresentation';

const CASCADE_ORDER: readonly ModelId[] = ['arome', 'arpege', 'icon_eu', 'gfs'];

export function cascadeBoundHours(model: ModelId): number {
  if (model === 'arome') {
    return CASCADE_BOUNDS_HOURS.aromeMax;
  }
  if (model === 'arpege') {
    return CASCADE_BOUNDS_HOURS.arpegeMax;
  }
  return CASCADE_BOUNDS_HOURS.mediumRangeMax;
}

/**
 * Texte explicatif "pourquoi ce modele" (DESIGN.md 6.2). Distingue le cas
 * nominal (AROME couvre l'echeance), le repli sur indisponibilite (un
 * modele plus fin manque pour ce lieu) et la progression normale de la
 * cascade (l'echeance depasse la portee des modeles plus fins).
 */
export function explainActiveModel(
  activeModel: ModelId,
  leadHours: number,
  available: readonly ModelId[],
): string {
  const roundedLead = Math.max(0, Math.round(leadHours));
  const activeIndex = CASCADE_ORDER.indexOf(activeModel);

  if (activeIndex <= 0) {
    return `Choisi car l'échéance (${roundedLead} h) est dans la portée d'AROME (jusqu'à ${cascadeBoundHours('arome')} h).`;
  }

  const finerModels = CASCADE_ORDER.slice(0, activeIndex);
  const unavailable = finerModels.filter(
    (model) => leadHours <= cascadeBoundHours(model) && !available.includes(model),
  );

  if (unavailable.length > 0) {
    const names = unavailable.map((model) => MODEL_LABELS[model]).join(', ');
    const verb = unavailable.length > 1 ? 'sont indisponibles' : 'est indisponible';
    return `${names} ${verb} pour ce lieu. ${MODEL_LABELS[activeModel]} prend le relais jusqu'à ${cascadeBoundHours(activeModel)} h.`;
  }

  return `Au-delà de la portée des modèles plus fins, ${MODEL_LABELS[activeModel]} prend le relais jusqu'à ${cascadeBoundHours(activeModel)} h.`;
}

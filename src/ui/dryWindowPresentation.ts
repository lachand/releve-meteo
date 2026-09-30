import { DRY_WINDOW } from '../domain/dryWindow';
import type { DryWindow } from '../domain/dryWindow';
import { formatHour } from './format';
import { MODEL_LABELS } from './modelLabels';

/* Phrase du meilleur creneau sec : les heures, la duree, et le modele qui les fournit. */

export function dryWindowSentence(window: DryWindow): string {
  if (window.status === 'none') {
    return `Pas de créneau sec de ${DRY_WINDOW.minHours} heures d’ici ce soir : pluie ou rafales.`;
  }
  const by = `selon ${window.models.map((model) => MODEL_LABELS[model]).join(', puis ')}`;
  const span = `de ${formatHour(window.start)} à ${formatHour(window.end)}`;
  return window.status === 'all-day'
    ? `Sec jusqu’à la nuit, ${span}, ${by}.`
    : `Meilleur créneau sec : ${span} (${window.hours} h), ${by}.`;
}

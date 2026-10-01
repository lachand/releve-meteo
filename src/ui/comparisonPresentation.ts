import type { ComparisonHour } from '../domain/dayDigest';
import { MODEL_LABELS } from './modelLabels';

/** « AROME », ou « AROME puis ARPEGE » quand le modele change dans la fenetre. */
export function modelsSentence(hours: readonly ComparisonHour[]): string {
  const models = [...new Set(hours.map((hour) => hour.model))];
  return models.map((model) => MODEL_LABELS[model]).join(' puis ');
}

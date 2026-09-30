import type { YesterdayReview } from '../domain/yesterdayReview';
import { formatInteger, formatLongDate, formatOneDecimal } from './format';
import { MODEL_LABELS } from './modelPresentation';

/*
 * Phrases du bilan d'hier. Le modele est toujours nomme, avec ce qui a ete
 * compare : la prevision de la veille, pas la simulation rejouee apres coup.
 */

/** En deca, l'ecart moyen est dans l'arrondi des releves au degre. */
const NEGLIGIBLE_BIAS_C = 0.5;

function degrees(value: number): string {
  return `${formatOneDecimal(Math.abs(value))}\u00a0°C`;
}

export function biasWords(bias: number): string {
  if (Math.abs(bias) < NEGLIGIBLE_BIAS_C) {
    return 'sans biais net';
  }
  return `${degrees(bias)} ${bias > 0 ? 'trop chaud' : 'trop froid'} en moyenne`;
}

export function yesterdayHeadline(review: YesterdayReview, stationName: string): string {
  const measured = `Hier, ${formatLongDate(review.date)}, la station ${stationName} a mesuré de ${formatInteger(review.observedMin)}\u00a0°C à ${formatInteger(review.observedMax)}\u00a0°C.`;
  const best = review.models[0];
  if (best === undefined) {
    return measured;
  }
  const bias = biasWords(best.bias);
  const detail =
    Math.abs(best.bias) < NEGLIGIBLE_BIAS_C
      ? `${bias}, erreur moyenne de ${degrees(best.mae)}`
      : bias;
  return `${measured} Prévu la veille, c’est ${MODEL_LABELS[best.model]} qui a vu le plus juste : ${detail} (${best.pairs} heures comparées).`;
}

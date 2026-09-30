import type { ModelDrift } from '../domain/stationTrace';
import { formatOneDecimal } from './format';

/*
 * Phrases de derive d'un modele face a la station : le sens et l'amplitude
 * de l'ecart des trois dernieres heures, et s'il s'elargit ou se resserre
 * par rapport aux trois heures d'avant.
 */

/** En deca, l'ecart est dans l'arrondi des releves au degre. */
const NEGLIGIBLE_GAP_C = 0.5;

const TREND_WORDS = {
  widening: 'l’écart s’élargit',
  narrowing: 'l’écart se resserre',
  steady: 'l’écart est stable',
} as const;

function magnitude(gap: number): string {
  return `${formatOneDecimal(Math.abs(gap))}\u00a0°C`;
}

export function driftSentence(drift: ModelDrift): string {
  const { recent, earlier, trend } = drift;
  if (recent === null) {
    return 'Trop peu d’heures comparables sur les 3 dernières heures.';
  }
  const now =
    Math.abs(recent) < NEGLIGIBLE_GAP_C
      ? 'Au plus près de la mesure depuis 3 h'
      : `${magnitude(recent)} ${recent > 0 ? 'trop chaud' : 'trop froid'} depuis 3 h`;
  if (trend === null || earlier === null) {
    return `${now}.`;
  }
  return `${now} : ${TREND_WORDS[trend]} (${magnitude(earlier)} sur les 3 heures d’avant).`;
}

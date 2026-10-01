import { RAIN_CHECK } from '../domain/rainCheck';
import type { RainCheck } from '../domain/rainCheck';
import { formatCompact, formatOneDecimal } from './format';
import { MODEL_LABELS } from './modelPresentation';

/** Ecart sous lequel on dit « a peu pres la meme quantite », mm. */
export const RAIN_SIMILAR_MM = 0.5;

const mm = (value: number): string => `${formatOneDecimal(value)}\u00a0mm`;

/** « 3,2 mm tombés » mesures a la station, avec les heures sans mesure dites. */
export function observedRainSentence(
  check: RainCheck,
  stationName: string,
  distanceKm: number,
): string {
  const gaps =
    check.missing === 0
      ? ''
      : ` (${check.missing}\u00a0h sans mesure, non comptée${check.missing > 1 ? 's' : ''})`;
  return `Mesuré à la station ${stationName} (${formatCompact(distanceKm)}\u00a0km) : ${mm(check.observedMm)} sur les ${RAIN_CHECK.hours}\u00a0dernières heures${gaps}.`;
}

/** Cumul que le modele calcule au lieu sur les memes heures, nomme. */
export function forecastRainSentence(check: RainCheck): string {
  return `Calculé au lieu par ${MODEL_LABELS[check.model]}, dans sa dernière exécution : ${mm(check.forecastMm)} sur les mêmes ${check.paired}\u00a0heures.`;
}

/** Ce que l'ecart entre les deux veut dire, sans verdict sur la station ou le modele. */
export function rainVerdictSentence(check: RainCheck): string {
  if (check.observedMm === 0 && check.forecastMm === 0) {
    return 'Ni la station ni le modèle n’ont vu de pluie.';
  }
  const gap = check.forecastMm - check.observedMm;
  if (Math.abs(gap) < RAIN_SIMILAR_MM) {
    return 'À peu près la même quantité des deux côtés.';
  }
  const model = MODEL_LABELS[check.model];
  return gap > 0
    ? `${model} voyait ${mm(gap)} de plus que la station.`
    : `${model} voyait ${mm(-gap)} de moins que la station.`;
}

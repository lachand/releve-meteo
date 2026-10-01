import type { WaveOutlook } from '../domain/marine';
import { waveForm } from '../domain/marine';
import { compassPoint, formatDayHour, formatOneDecimal } from './format';

const metres = (value: number): string => `${formatOneDecimal(value)}\u00a0m`;

/** « Mer belle : vagues de 0,8 m, période 7 s, de l'ouest. » ou null sans hauteur courante. */
export function currentSeaSentence(outlook: WaveOutlook): string | null {
  const { current } = outlook;
  if (current === null) {
    return null;
  }
  const period = current.period === null ? '' : `, période ${Math.round(current.period)}\u00a0s`;
  const origin = current.direction === null ? '' : `, venant du ${compassPoint(current.direction)}`;
  return `Mer ${waveForm(current.height)} : vagues de ${metres(current.height)}${period}${origin}.`;
}

/** « Pic des 48 prochaines heures : 2,1 m lundi 12h, période 9 s (mer agitée). » */
export function peakSeaSentence(outlook: WaveOutlook, hours: number): string | null {
  const { peak } = outlook;
  if (peak === null) {
    return null;
  }
  const period = peak.period === null ? '' : `, période ${Math.round(peak.period)}\u00a0s`;
  return `Pic des ${hours}\u00a0prochaines heures : ${metres(peak.height)} ${formatDayHour(peak.time)}${period} (mer ${waveForm(peak.height)}).`;
}

export const SEA_CAVEAT =
  'Hauteur significative des vagues (la moyenne du tiers le plus haut) : des vagues isolées peuvent être près de deux fois plus hautes. Prévision d’un modèle de vagues, pas une mesure de bouée, et pas un avis de navigation : la vigilance « vagues-submersion » de Météo-France reste la référence.';

import { CALIBRATION } from '../domain/calibration';
import type { CalibrationSummary, LevelCalibration } from '../domain/calibration';
import type { DayConfidence } from '../domain/forecastDrift';
import { formatInteger, formatLongDate, formatOneDecimal, formatPercent } from './format';

/*
 * Phrases de la confiance auto-evaluee. Le niveau est le mot que l'ecran
 * dit deja (« confiance elevee ») ; chaque chiffre dit sur combien de jours
 * il repose, et rien n'est conclu avant assez de jours.
 */

const NBSP = ' ';

export const CONFIDENCE_WORDS: Readonly<Record<DayConfidence, string>> = {
  high: 'confiance élevée',
  medium: 'confiance moyenne',
  low: 'confiance basse',
};

function days(count: number): string {
  return `${formatInteger(count)}${NBSP}jour${count > 1 ? 's' : ''}`;
}

/** « Confiance élevée : écart moyen de 0,9 °C sur 12 jours, 83 % à moins de 1,5 °C. » */
export function levelLine(level: LevelCalibration): string {
  const lead = CONFIDENCE_WORDS[level.level];
  return `${lead.charAt(0).toUpperCase()}${lead.slice(1)} : écart moyen de ${formatOneDecimal(level.meanError)}${NBSP}°C sur ${days(level.days)}, ${formatPercent(level.within)} à moins de ${formatOneDecimal(CALIBRATION.withinDegrees)}${NBSP}°C.`;
}

/** Ce que le bilan permet de conclure : graduee, non graduee, ou pas encore assez de jours. */
export function calibrationVerdict(summary: CalibrationSummary): string {
  if (summary.graded === null) {
    return `Pas encore assez de jours pour juger la confiance : il en faut au moins ${CALIBRATION.minDaysPerLevel}${NBSP}en confiance élevée et en confiance basse.`;
  }
  return summary.graded
    ? 'Jusqu’ici, la confiance élevée s’est montrée plus juste que la confiance basse : le niveau annoncé dit quelque chose.'
    : 'Jusqu’ici, la confiance élevée ne s’est pas montrée plus juste que la confiance basse : le niveau annoncé ne dit rien de fiable ici.';
}

/** « Depuis le 20 septembre 2026, 14 jours vérifiés sur cet appareil. » */
export function calibrationHeadline(summary: CalibrationSummary): string {
  return `Depuis le ${formatLongDate(summary.from)}, ${days(summary.days)} vérifiés sur cet appareil : la prévision gardée la veille, avec la confiance qu’elle portait pour la température, face au maximum et au minimum mesurés.`;
}

import type { WeekLeader, WeeklyComparison } from '../domain/reliability';
import { formatDayMonth, formatOneDecimal } from './format';
import { MODEL_LABELS } from './modelPresentation';

function leaderText(leader: WeekLeader): string {
  return `${MODEL_LABELS[leader.model]} (${formatOneDecimal(leader.mae)}\u00a0°C d’erreur moyenne)`;
}

/**
 * Qui a ete le plus juste ces 7 derniers jours, et les 7 d'avant : une
 * phrase, pour voir si le classement tient ou s'il a tourne. Mesure de la
 * temperature prevue la veille, comme le tableau qu'elle accompagne.
 */
export function weeklySentence(comparison: WeeklyComparison): string {
  const { recent, previous, lastDate } = comparison;
  const until = `jusqu’au ${formatDayMonth(lastDate)}`;
  if (recent !== null && previous !== null) {
    if (recent.model === previous.model) {
      return `${MODEL_LABELS[recent.model]} a été le plus juste ces 7 derniers jours (${until}), comme les 7 jours d’avant : ${formatOneDecimal(recent.mae)}\u00a0°C d’erreur moyenne, contre ${formatOneDecimal(previous.mae)}\u00a0°C.`;
    }
    return `Ces 7 derniers jours (${until}), ${leaderText(recent)} a été le plus juste ; les 7 jours d’avant, ${leaderText(previous)}. Le classement a changé.`;
  }
  if (recent !== null) {
    return `Ces 7 derniers jours (${until}), ${leaderText(recent)} a été le plus juste ; l’historique ne remonte pas assez loin pour comparer aux 7 jours d’avant.`;
  }
  if (previous === null) {
    return '';
  }
  return `Les 7 derniers jours n’ont pas assez de mesures pour désigner le plus juste ; les 7 jours d’avant, c’était ${leaderText(previous)}.`;
}

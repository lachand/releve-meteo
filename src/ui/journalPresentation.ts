import type { JournalSummary } from '../domain/journal';
import { formatInteger, formatLongDate, formatOneDecimal } from './format';
import { MODEL_LABELS } from './modelPresentation';

/*
 * Phrases du journal des previsions. Chaque modele est nomme ; le journal dit
 * ce qu'il compte (des jours de bilan enregistres sur cet appareil) et ce qu'il
 * ne compte pas.
 */

function plural(count: number, one: string, many: string): string {
  return `${formatInteger(count)}\u00a0${count > 1 ? many : one}`;
}

/**
 * « Depuis le 12 septembre, 18 jours de bilan sont gardés sur cet appareil :
 * ICON-D2 a été le plus proche de la mesure 9 jours, AROME France 5, AROME 4. »
 */
export function journalHeadline(summary: JournalSummary): string {
  const days = plural(summary.days, 'jour', 'jours');
  const [first, ...others] = summary.leaders;
  if (first === undefined) {
    return `${days} de bilan gardés sur cet appareil, sans modèle comparable.`;
  }
  const rest = others
    .slice(0, 2)
    .map((leader) => `${MODEL_LABELS[leader.model]} ${formatInteger(leader.wins)}`)
    .join(', ');
  const lead = `${MODEL_LABELS[first.model]} a été le plus proche de la mesure ${plural(first.wins, 'jour', 'jours')}`;
  return `Depuis le ${formatLongDate(summary.from)}, ${days} de bilan gardés sur cet appareil : ${lead}${rest === '' ? '' : `, ${rest}`}.`;
}

/** « 1,2 °C d'erreur moyenne sur 18 jours ». */
export function journalErrorLine(mae: number, days: number): string {
  return `${formatOneDecimal(mae)}\u00a0°C d’erreur moyenne sur ${plural(days, 'jour', 'jours')}`;
}

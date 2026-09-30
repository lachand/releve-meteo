import { SOLAR } from '../domain/solarOutlook';
import type { SolarDay } from '../domain/solarOutlook';
import { formatCompact, formatInteger } from './format';

/*
 * Phrases du solaire. La production est toujours dite « estimée », le
 * critere du surplus est ecrit, et une journee sans rayonnement complet est
 * « inconnue », jamais nulle.
 */

const SHARE = `${formatInteger(SOLAR.strongShare * 100)}\u00a0%`;

export function solarDaySentence(day: SolarDay, today: string): string {
  const label = day.date === today ? 'Aujourd’hui' : 'Demain';
  if (day.kwh === null || day.strongHours === null) {
    return `${label} : production inconnue, au moins une heure sans rayonnement prévu.`;
  }
  const verdict = day.favourable
    ? 'journée favorable au surplus'
    : 'journée peu favorable au surplus';
  return `${label} : environ ${formatCompact(day.kwh)}\u00a0kWh estimés, ${verdict} (${day.strongHours} h au-dessus de ${SHARE} de la puissance crête).`;
}

export function solarCriterion(): string {
  return `Favorable au surplus : au moins ${SOLAR.minStrongHours} h où la production estimée dépasse ${SHARE} de la puissance crête. Le surplus réel dépend de votre consommation, que l’application ignore.`;
}

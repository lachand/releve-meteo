import { DRIFT } from '../domain/forecastDrift';
import type { Change, DayDrift, Drift } from '../domain/forecastDrift';
import { localIsoFromUtc } from '../domain/time';
import { formatCompact, formatHour, formatWeekday, localDateOf } from './format';
import { MODEL_LABELS } from './modelPresentation';

/*
 * Phrases de « la prevision a bouge » : chaque ecart dit de combien, depuis
 * quand, et si c'est un autre modele qui parle.
 */

const NBSP = ' ';

/** « hier à 21h », « aujourd'hui à 8h » ou « jeudi à 21h » : l'heure de la prevision comparee. */
export function sinceLabel(since: number, now: Date): string {
  const iso = localIsoFromUtc(since);
  const date = iso.slice(0, 10);
  const today = localDateOf(now);
  const yesterday = localDateOf(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const day = date === today ? 'aujourd’hui' : date === yesterday ? 'hier' : formatWeekday(date);
  return `${day} à ${formatHour(iso)}`;
}

function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10 + 0;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${formatCompact(Math.abs(rounded))}`;
}

function temperature(label: string, change: Change): string {
  return `${label} ${formatCompact(Math.round(change.now * 10) / 10)}${NBSP}°C (${signed(change.delta)}${NBSP}°C, ${formatCompact(Math.round(change.before * 10) / 10)}${NBSP}°C annoncés)`;
}

/** « samedi : maximum 21 °C (+3 °C, 18 °C annoncés), pluie 6 mm (+5,6 mm, 0,4 mm annoncés) ». */
export function dayDriftSentence(day: DayDrift): string {
  const parts: string[] = [];
  if (day.fields.includes('tempMax') && day.tempMax !== null) {
    parts.push(temperature('maximum', day.tempMax));
  }
  if (day.fields.includes('tempMin') && day.tempMin !== null) {
    parts.push(temperature('minimum', day.tempMin));
  }
  if (day.fields.includes('rain') && day.rain !== null) {
    parts.push(
      `pluie ${formatCompact(Math.round(day.rain.now * 10) / 10)}${NBSP}mm (${signed(day.rain.delta)}${NBSP}mm, ${formatCompact(Math.round(day.rain.before * 10) / 10)}${NBSP}mm annoncés)`,
    );
  }
  const model = day.modelChanged
    ? `, d’un autre modèle (${MODEL_LABELS[day.modelBefore]} avant, ${MODEL_LABELS[day.modelNow]} maintenant)`
    : '';
  return `${formatWeekday(day.date)} : ${parts.join(', ')}${model}`;
}

/** Une phrase pour l'ensemble : ce qui a bouge, ou la stabilite, toujours avec le depart de la comparaison. */
export function driftHeadline(drift: Drift, now: Date): string {
  const since = sinceLabel(drift.since, now);
  if (drift.days.length === 0) {
    return `Aucun jour à comparer avec la prévision gardée ${since}.`;
  }
  if (drift.moved.length === 0) {
    return `Prévision stable depuis ${since} : aucun jour ne bouge d’au moins ${DRIFT.temperatureDegrees}${NBSP}°C ou ${DRIFT.rainMm}${NBSP}mm, ni du sec au mouillé.`;
  }
  const count = drift.moved.length;
  return `${count}${NBSP}jour${count > 1 ? 's ont' : ' a'} bougé depuis la prévision gardée ${since}.`;
}

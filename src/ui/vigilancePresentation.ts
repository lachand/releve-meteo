import { localIsoFromUtc } from '../domain/time';
import type { VigilanceLevel, VigilancePhenomenon, VigilanceWarning } from '../domain/vigilance';
import { formatHour, formatWeekday } from './format';

/*
 * Mots de la vigilance Meteo-France : les niveaux et phenomenes portent
 * leurs noms officiels, et les periodes se lisent en heure de Paris.
 */

export const VIGILANCE_LEVEL_WORDS: Readonly<Record<VigilanceLevel, string>> = {
  1: 'verte',
  2: 'jaune',
  3: 'orange',
  4: 'rouge',
};

export const VIGILANCE_PHENOMENON_LABELS: Readonly<Record<VigilancePhenomenon, string>> = {
  wind: 'vent violent',
  rain: 'pluie-inondation',
  thunderstorm: 'orages',
  flood: 'crues',
  snowIce: 'neige-verglas',
  heat: 'canicule',
  cold: 'grand froid',
  avalanche: 'avalanches',
  waves: 'vagues-submersion',
};

/** Signification officielle de chaque niveau, pour le nom accessible des pastilles. */
export const VIGILANCE_LEVEL_MEANINGS: Readonly<Record<VigilanceLevel, string>> = {
  1: 'pas de vigilance particulière',
  2: 'soyez attentif',
  3: 'soyez très vigilant',
  4: 'vigilance absolue',
};

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

function dayWord(date: string, today: string): string {
  if (date === today) {
    return 'aujourd’hui';
  }
  return date === nextDate(today) ? 'demain' : formatWeekday(date);
}

/** « de lundi », « d’aujourd’hui ». */
function fromDay(day: string): string {
  return /^[aeiou]/.test(day) ? `d’${day}` : `de ${day}`;
}

interface LocalMoment {
  readonly date: string;
  readonly hour: string;
}

function beginMoment(utcMs: number): LocalMoment {
  const iso = localIsoFromUtc(utcMs);
  return { date: iso.slice(0, 10), hour: formatHour(iso) };
}

/** Une fin a 00h00 se lit « minuit » du jour qui s'acheve. */
function endMoment(utcMs: number): LocalMoment {
  const iso = localIsoFromUtc(utcMs);
  if (iso.slice(11, 16) === '00:00') {
    return { date: localIsoFromUtc(utcMs - MINUTE_MS).slice(0, 10), hour: 'minuit' };
  }
  return { date: iso.slice(0, 10), hour: formatHour(iso) };
}

/**
 * « en cours, jusqu’à minuit », « demain, de 06h à 18h », « demain, toute la journée »,
 * « d’aujourd’hui 20h à demain 6h ».
 */
export function vigilancePeriodPhrase(warning: VigilanceWarning, now: Date): string {
  const today = localIsoFromUtc(now.getTime()).slice(0, 10);
  const end = endMoment(warning.endUtcMs);
  const endDay = dayWord(end.date, today);
  if (warning.beginUtcMs <= now.getTime()) {
    return end.date === today
      ? `en cours, jusqu’à ${end.hour}`
      : `en cours, jusqu’à ${endDay} ${end.hour}`;
  }
  const begin = beginMoment(warning.beginUtcMs);
  const beginDay = dayWord(begin.date, today);
  if (begin.date === end.date) {
    if (begin.hour === '00h' && end.hour === 'minuit') {
      return `${beginDay}, toute la journée`;
    }
    return `${beginDay}, de ${begin.hour} à ${end.hour}`;
  }
  return `${fromDay(beginDay)} ${begin.hour} à ${endDay} ${end.hour}`;
}

/** « 16h », « hier 16h » : heure d'emission du bulletin. */
export function bulletinTimePhrase(issuedUtcMs: number, now: Date): string {
  const today = localIsoFromUtc(now.getTime()).slice(0, 10);
  const issued = beginMoment(issuedUtcMs);
  if (issued.date === today) {
    return issued.hour;
  }
  return nextDate(issued.date) === today
    ? `hier ${issued.hour}`
    : `${formatWeekday(issued.date)} ${issued.hour}`;
}

/*
 * Formatage francais partage. Une valeur absente s'affiche par MISSING,
 * jamais par 0 (AGENTS.md regle 3), et jamais par un tiret cadratin
 * (AGENTS.md regle 8).
 */

export const MISSING = '–';

const oneDecimal = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const upToOneDecimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function formatOneDecimal(value: number | null): string {
  return value === null ? MISSING : oneDecimal.format(value);
}

export function formatInteger(value: number | null): string {
  // Evite l'affichage « -0 » d'une valeur arrondie a zero.
  return value === null ? MISSING : integer.format(Math.round(value) + 0);
}

/** 0,4 ; 12 ; 3,5 : au plus une decimale, sans zero superflu. */
export function formatCompact(value: number | null): string {
  return value === null ? MISSING : upToOneDecimal.format(value);
}

/** Temperature arrondie au degre, avec signe typographique moins. */
export function formatTemperature(value: number | null): string {
  if (value === null) {
    return MISSING;
  }
  const rounded = Math.round(value) + 0;
  return rounded < 0 ? `−${Math.abs(rounded)}` : String(rounded);
}

/** Pourcentage entier a partir d'une proportion [0, 1]. */
export function formatPercent(proportion: number | null): string {
  return proportion === null ? MISSING : `${Math.round(proportion * 100)} %`;
}

/** Heure locale « 14h » depuis 'YYYY-MM-DDTHH:mm'. */
export function formatHour(iso: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (match === null) {
    return iso;
  }
  return match[2] === '00' ? `${match[1]}h` : `${match[1]}h${match[2]}`;
}

const weekdayShort = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short' });
const weekdayLong = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long' });
const dayMonth = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
});
const longDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function noonUtc(date: string): Date {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`);
}

/** « lun. 28 » depuis 'YYYY-MM-DD'. */
export function formatDayShort(date: string): string {
  return `${weekdayShort.format(noonUtc(date))} ${Number(date.slice(8, 10))}`;
}

/** « lundi » depuis 'YYYY-MM-DD'. */
export function formatWeekday(date: string): string {
  return weekdayLong.format(noonUtc(date));
}

/** « 28 septembre » depuis 'YYYY-MM-DD'. */
export function formatDayMonth(date: string): string {
  return dayMonth.format(noonUtc(date));
}

/** « lundi 28 septembre 2026 » depuis 'YYYY-MM-DD'. */
export function formatLongDate(date: string): string {
  return longDate.format(noonUtc(date));
}

/** « lundi 14h » depuis 'YYYY-MM-DDTHH:mm'. */
export function formatDayHour(iso: string): string {
  return `${formatWeekday(iso)} ${formatHour(iso)}`;
}

/** Date locale Europe/Paris 'YYYY-MM-DD' d'un instant. */
export function localDateOf(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

/** Point cardinal d'ou vient le vent (convention meteorologique). */
export function compassPoint(degrees: number | null): string {
  if (degrees === null) {
    return MISSING;
  }
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % COMPASS_POINTS.length;
  return COMPASS_POINTS[index] ?? MISSING;
}

/** Duree lisible : « 25 min », « 1 h 15 ». */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes - hours * 60);
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

import type { LocalIsoHour } from './types';

const TIME_ZONE = 'Europe/Paris';

const ZONE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Offset Europe/Paris (minutes a l'est de UTC) pour un instant UTC donne. */
function offsetMinutesAt(utcMs: number): number {
  const parts = ZONE_FORMATTER.formatToParts(new Date(utcMs));
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    // Chaque `type` demande ici correspond a une option de ZONE_FORMATTER :
    // formatToParts la retourne toujours. Filet de securite non atteignable
    // en pratique, exclu de la couverture plutot que simule par un test.
    /* v8 ignore next */
    return part === undefined ? 0 : Number(part.value);
  };
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return (asIfUtc - utcMs) / (60 * 1000);
}

/**
 * Convertit une heure murale Europe/Paris (annee, mois, jour, heure, minute)
 * en instant UTC (epoch ms), independamment du fuseau horaire de la
 * machine d'execution. Necessaire car domain/ doit produire le meme
 * resultat quel que soit le serveur ou le navigateur qui l'execute.
 *
 * Resout l'ambiguite par une double approximation : le fuseau reel n'a que
 * des transitions d'une heure, donc deux iterations suffisent toujours a
 * converger.
 */
function zonedWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = offsetMinutesAt(guess);
  const adjusted = guess - firstOffset * 60 * 1000;
  const secondOffset = offsetMinutesAt(adjusted);
  return secondOffset === firstOffset ? adjusted : guess - secondOffset * 60 * 1000;
}

function parseLocalIso(iso: LocalIsoHour): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(iso);
  if (match === null) {
    throw new Error(`Format d'instant local invalide: ${iso}`);
  }
  const [, year, month, day, hour, minute] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  return zonedWallTimeToUtcMs(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
  );
}

/**
 * Difference en heures entre deux instants ISO locaux Europe/Paris,
 * tolerante au changement d'heure : le calcul passe par l'instant UTC reel
 * de chaque borne, pas par une simple soustraction d'heures murales.
 */
export function hoursBetween(from: LocalIsoHour, to: LocalIsoHour): number {
  return (parseLocalIso(to) - parseLocalIso(from)) / (60 * 60 * 1000);
}

/**
 * Echeance en heures entre l'instant now et un point de timeline local.
 * Negative si le point est passe. Utilise par modelCascade.ts, seul autre
 * module autorise a raisonner sur des echeances : toute l'arithmetique
 * passe malgre tout par ce fichier.
 */
export function leadHoursFrom(now: Date, point: LocalIsoHour): number {
  return (parseLocalIso(point) - now.getTime()) / (60 * 60 * 1000);
}

/** Index du premier point de timeline egal ou posterieur a now. -1 si aucun. */
export function indexOfNow(timeline: readonly LocalIsoHour[], now: Date): number {
  const nowMs = now.getTime();
  for (const [i, point] of timeline.entries()) {
    if (parseLocalIso(point) >= nowMs) {
      return i;
    }
  }
  return -1;
}

/**
 * Detecte un saut d'offset UTC Europe/Paris dans la serie (passage heure
 * ete/hiver). Compare directement l'offset a chaque point plutot que
 * l'ecart d'heures entre points consecutifs : quand Open-Meteo omet
 * l'heure inexistante du printemps, l'ecart reel reste de 1h de part et
 * d'autre du saut, seul l'offset change.
 */
export function hasDstTransition(timeline: readonly LocalIsoHour[]): boolean {
  const [first, ...rest] = timeline;
  if (first === undefined) {
    return false;
  }
  const baseline = offsetMinutesAt(parseLocalIso(first));
  return rest.some((point) => offsetMinutesAt(parseLocalIso(point)) !== baseline);
}

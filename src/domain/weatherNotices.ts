import type { PhenomenonEpisode, PhenomenonKind } from './phenomena';
import type { AlertPoint } from './alerts';
import { localIsoFromUtc, leadHoursFrom } from './time';
import type { LocalIsoHour } from './types';

/*
 * Notifications meteo choisies par l'utilisateur : phenomenes violents a
 * venir, pluie, pollens, soit regroupes le matin a une heure choisie, soit
 * des qu'ils sont detectes. Rien ici n'est envoye : ce module decide ce qui
 * merite d'etre dit, a partir des memes episodes et series que la page.
 */

export interface NotifyPrefs {
  /** Phenomenes violents a venir (orage, forte pluie, vent fort, ...). */
  readonly risks: boolean;
  /** Pluie a venir. */
  readonly rain: boolean;
  /** Pollens a un niveau eleve. */
  readonly pollen: boolean;
  /** Eclairs observes a proximite d'un favori, toujours des la detection. */
  readonly lightning: boolean;
  /** 'morning' : une notification groupee a l'heure choisie ; 'instant' : des la detection. */
  readonly mode: 'morning' | 'instant';
  /** Heure visee du matin, 0 a 23 (heure de Paris). */
  readonly hour: number;
}

export const DEFAULT_NOTIFY: NotifyPrefs = {
  risks: false,
  rain: false,
  pollen: false,
  lightning: false,
  mode: 'morning',
  hour: 7,
};

/** Lit des preferences enregistrees, en tolerant l'absence ou une valeur illisible. */
export function normalizeNotify(raw: unknown): NotifyPrefs {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const hour = value.hour;
  return {
    risks: value.risks === true,
    rain: value.rain === true,
    pollen: value.pollen === true,
    lightning: value.lightning === true,
    mode: value.mode === 'instant' ? 'instant' : 'morning',
    hour:
      typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour <= 23
        ? hour
        : DEFAULT_NOTIFY.hour,
  };
}

/** Heures apres l'heure visee pendant lesquelles la notification du matin peut encore partir. */
export const MORNING_GRACE_HOURS = 6;

/**
 * Date locale (AAAA-MM-JJ) si `now` tombe dans la matinee visee, de l'heure
 * choisie a MORNING_GRACE_HOURS plus tard (sans passer minuit), sinon null.
 * Le navigateur choisit le moment de la veille : la notification part a la
 * premiere veille de cette plage, pas a la minute.
 */
export function morningDue(now: Date, hour: number): string | null {
  const local = localIsoFromUtc(now.getTime());
  const current = Number(local.slice(11, 13));
  return current >= hour && current < Math.min(hour + MORNING_GRACE_HOURS, 24)
    ? local.slice(0, 10)
    : null;
}

/** Horizon des phenomenes annonces, heures. */
export const RISK_HORIZON_HOURS = 48;

/** Phenomenes a signaler des le niveau modere ; les autres, au niveau fort seulement. */
const VIOLENT_AT_MODERATE: ReadonlySet<PhenomenonKind> = new Set([
  'thunderstorm',
  'heavyRain',
  'strongWind',
  'freezingRain',
]);

/**
 * Episodes violents encore a venir (ou en cours) dans l'horizon : orage,
 * forte pluie, vent fort et pluie verglacante des le niveau modere ; gel,
 * neige, brouillard et chaleur au niveau fort seulement.
 */
export function violentEpisodes(
  episodes: readonly PhenomenonEpisode[],
  now: Date,
  horizonHours: number = RISK_HORIZON_HOURS,
): readonly PhenomenonEpisode[] {
  return episodes.filter((episode) => {
    const violent =
      episode.level === 'high' ||
      (episode.level === 'moderate' && VIOLENT_AT_MODERATE.has(episode.kind));
    return (
      violent &&
      leadHoursFrom(now, episode.end) >= 0 &&
      leadHoursFrom(now, episode.start) <= horizonHours
    );
  });
}

/** Un phenomene violent est notifie une fois par lieu, nature et debut. */
export function violentKey(placeId: string, episode: PhenomenonEpisode): string {
  return `risque|${placeId}|${episode.kind}|${episode.start}`;
}

/** Pluie horaire, mm, a partir de laquelle une heure est dite pluvieuse. */
export const RAIN_HOUR_MM = 0.3;
/** Fenetre « pluie a venir » des notifications immediates, heures. */
export const RAIN_AHEAD_HOURS = 3;
/** Fenetre du cumul annonce, heures. */
export const RAIN_TOTAL_HOURS = 24;

export interface RainAhead {
  /** Premiere heure pluvieuse dans les prochaines heures. */
  readonly start: LocalIsoHour;
  /** Cumul sur RAIN_TOTAL_HOURS, mm. */
  readonly totalMm: number;
  /** Modele qui porte la premiere heure pluvieuse. */
  readonly model: AlertPoint['model'];
}

/**
 * Pluie attendue dans les RAIN_AHEAD_HOURS prochaines heures, avec le cumul
 * sur 24 h ; null s'il n'y a pas d'heure pluvieuse. Une valeur absente
 * n'est jamais de la pluie, ni un zero dans le cumul.
 */
export function rainAhead(points: readonly AlertPoint[], now: Date): RainAhead | null {
  const upcoming = points.filter((point) => {
    const lead = leadHoursFrom(now, point.time);
    return lead >= -1 && lead <= RAIN_TOTAL_HOURS;
  });
  const first = upcoming.find((point) => {
    const value = point.precipitation.value;
    return (
      value !== null && value >= RAIN_HOUR_MM && leadHoursFrom(now, point.time) <= RAIN_AHEAD_HOURS
    );
  });
  if (first === undefined) {
    return null;
  }
  const totalMm = upcoming.reduce((sum, point) => sum + (point.precipitation.value ?? 0), 0);
  return { start: first.time, totalMm, model: first.model };
}

/** Une pluie a venir est notifiee une fois par lieu et par plage de six heures. */
export function rainKey(placeId: string, start: LocalIsoHour): string {
  return `pluie|${placeId}|${start.slice(0, 10)}|${Math.floor(Number(start.slice(11, 13)) / 6)}`;
}

/** Grains/m3 a partir desquels un pollen est dit eleve (seuils usuels du RNSA, simplifies). */
export const POLLEN_THRESHOLDS = { low: 1, medium: 20, high: 80 } as const;

export interface PollenPeak {
  readonly kind: string;
  /** Valeur de pointe sur les prochaines 24 h, grains/m3. */
  readonly peak: number;
}

/**
 * Pollens a un niveau eleve dans les prochaines 24 h, du plus fort au moins
 * fort ; liste vide sinon. Les valeurs absentes sont ignorees.
 */
export function highPollen(
  timeline: readonly LocalIsoHour[],
  pollen: Readonly<Record<string, readonly (number | null)[]>>,
  now: Date,
): readonly PollenPeak[] {
  const indexes = timeline.flatMap((time, index) => {
    const lead = leadHoursFrom(now, time);
    return lead >= -1 && lead <= 24 ? [index] : [];
  });
  return Object.entries(pollen)
    .flatMap(([kind, values]): PollenPeak[] => {
      const known = indexes.flatMap((index) => {
        const value = values[index] ?? null;
        return value === null ? [] : [value];
      });
      const peak = known.length === 0 ? null : Math.max(...known);
      return peak !== null && peak >= POLLEN_THRESHOLDS.high ? [{ kind, peak }] : [];
    })
    .sort((a, b) => b.peak - a.peak);
}

/** Les pollens eleves sont notifies une fois par jour et par lieu. */
export function pollenKey(placeId: string, date: string): string {
  return `pollen|${placeId}|${date}`;
}

/** Des eclairs a proximite sont notifies une fois par lieu et par plage de trois heures. */
export function lightningKey(placeId: string, now: Date): string {
  const local = localIsoFromUtc(now.getTime());
  return `foudre|${placeId}|${local.slice(0, 10)}|${Math.floor(Number(local.slice(11, 13)) / 3)}`;
}

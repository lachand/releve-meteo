import type { AlertHit } from './alerts';
import type { ModelVerification } from './reliability';
import type { SpreadHit } from './spreadAlerts';
import { DEFAULT_NOTIFY } from './weatherNotices';
import type { NotifyPrefs } from './weatherNotices';
import type { AlertRule, ModelId, Place, Preferences, TerrainProfile } from './types';
import type { VigilanceWarning } from './vigilance';

/*
 * Veille en arriere-plan : quand le navigateur le permet (Periodic
 * Background Sync, Chrome et Edge, application installee), le service
 * worker recharge de temps en temps la prevision des lieux veilles,
 * evalue les alertes personnelles avec la meme cascade que la page, lit
 * la vigilance Meteo-France, et notifie ce qui est nouveau. Sans serveur
 * d'envoi, c'est le navigateur qui decide du rythme.
 *
 * L'application recopie ici ce que le service worker ne peut pas
 * recalculer seul (preferences en localStorage, terrain, verification en
 * cache, choix manuel).
 */

/** Lieu veille, avec les intrants de selection de modele de sa page. */
export interface WatchEntry {
  readonly place: Place;
  readonly department: { readonly code: string; readonly name: string } | null;
  /** Regles actives de ce lieu ; vide : vigilance seule. */
  readonly rules: readonly AlertRule[];
  readonly terrain: TerrainProfile | null;
  readonly verification: readonly ModelVerification[];
  readonly preferred: ModelId | null;
}

export interface WatchState {
  readonly entries: readonly WatchEntry[];
  readonly windUnit: Preferences['units']['wind'];
  /** Cle de chaque notification deja montree, avec son instant (epoch ms). */
  readonly notified: Readonly<Record<string, number>>;
  /** Derniere veille menee a bien, epoch ms. */
  readonly lastRunUtcMs: number | null;
  /** Resume du matin : choix de l'utilisateur, desactive par defaut. */
  readonly digest: boolean;
  /** Notifications de risques, de pluie et de pollens : choix de l'utilisateur, rien par defaut. */
  readonly notify: NotifyPrefs;
}

/** Seules les vigilances orange et rouge meritent une notification. */
export const WATCH_VIGILANCE_MIN_LEVEL = 3;

/** Une cle notifiee est oubliee apres ce delai : l'horizon d'alerte est de 72 h. */
export const NOTIFIED_RETENTION_HOURS = 96;

const HOUR_MS = 60 * 60 * 1000;

export function emptyWatchState(): WatchState {
  return {
    entries: [],
    windUnit: 'kmh',
    notified: {},
    lastRunUtcMs: null,
    digest: false,
    notify: DEFAULT_NOTIFY,
  };
}

/**
 * Lieux a veiller : les favoris (vigilance), puis tout lieu connu portant
 * une regle active (alertes). Sans doublon, favoris d'abord.
 */
export function watchedPlaces(input: {
  readonly favourites: readonly Place[];
  readonly rules: readonly AlertRule[];
  /** Autres lieux dont l'objet Place est connu (lieu ouvert, veille precedente). */
  readonly known: readonly Place[];
}): readonly Place[] {
  const withRules = new Set(input.rules.filter((rule) => rule.enabled).map((r) => r.placeId));
  const places: Place[] = [...input.favourites];
  for (const place of input.known) {
    if (withRules.has(place.id) && !places.some((p) => p.id === place.id)) {
      places.push(place);
    }
  }
  return places.filter((place, index) => places.findIndex((p) => p.id === place.id) === index);
}

/** Une alerte est notifiee une fois par regle et par premiere heure franchie. */
export function alertKey(hit: AlertHit): string {
  return `alerte|${hit.rule.id}|${hit.first.time}`;
}

/** Lieux resumes par veille, favoris d'abord : une notification chacun. */
export const DIGEST_MAX_PLACES = 3;

/** Un resume par jour et par lieu. */
export function digestKey(date: string, placeId: string): string {
  return `resume|${date}|${placeId}`;
}

/** Un desaccord entre modeles est notifie une fois par regle et par premiere heure depassee. */
export function spreadKey(hit: SpreadHit): string {
  return `ecart|${hit.rule.id}|${hit.first.time}`;
}

/** Une vigilance est notifiee une fois par phenomene, niveau et debut. */
export function vigilanceKey(department: string, warning: VigilanceWarning): string {
  return `vigilance|${department}|${warning.phenomenon}|${warning.level}|${warning.beginUtcMs}|${warning.coastal ? 'littoral' : 'terre'}`;
}

/** Oublie les cles notifiees il y a plus de NOTIFIED_RETENTION_HOURS. */
export function pruneNotified(
  notified: Readonly<Record<string, number>>,
  now: Date,
): Record<string, number> {
  const oldest = now.getTime() - NOTIFIED_RETENTION_HOURS * HOUR_MS;
  return Object.fromEntries(Object.entries(notified).filter(([, at]) => at >= oldest));
}

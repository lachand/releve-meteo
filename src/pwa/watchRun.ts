import { fetchForecast } from '../data/clients/openMeteo';
import { fetchVigilance } from '../data/clients/vigilance';
import { mapOpenMeteoResponse } from '../data/mappers/openMeteoMapper';
import { evaluateAlerts } from '../domain/alerts';
import { MODEL_ORDER } from '../domain/models';
import { summarizeVigilance } from '../domain/vigilance';
import { WATCH_VIGILANCE_MIN_LEVEL, alertKey, vigilanceKey } from '../domain/watch';
import type { WatchEntry, WatchState } from '../domain/watch';
import { hitSentence, ruleSentence } from '../ui/alertPresentation';
import { computeCascadeView } from '../ui/cascadeView';
import { sharedPlaceSearch } from '../ui/sharedPlace';
import {
  VIGILANCE_LEVEL_WORDS,
  VIGILANCE_PHENOMENON_LABELS,
  bulletinTimePhrase,
  vigilancePeriodPhrase,
} from '../ui/vigilancePresentation';

/*
 * Une veille : pour chaque lieu veille, la prevision rechargee passe par
 * la meme cascade que la page, les alertes sont evaluees, la vigilance
 * est lue ; seul ce qui n'a pas deja ete notifie (ou vu dans la page)
 * ressort. Aucun acces au service worker ici : testable tel quel.
 */

/** Jours de prevision recharges : l'horizon d'alerte est de 72 h. */
export const WATCH_FORECAST_DAYS = 4;

export interface WatchNotification {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  /** Page du lieu, a ouvrir au clic. */
  readonly url: string;
}

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function placeLabel(entry: WatchEntry): string {
  return entry.place.alias ?? entry.place.name;
}

async function alertNotifications(
  entry: WatchEntry,
  windUnit: WatchState['windUnit'],
  now: Date,
): Promise<readonly WatchNotification[]> {
  const rules = entry.rules.filter((rule) => rule.enabled);
  if (rules.length === 0) {
    return [];
  }
  const response = await fetchForecast({
    latitude: entry.place.latitude,
    longitude: entry.place.longitude,
    models: MODEL_ORDER,
    pastDays: 0,
    forecastDays: WATCH_FORECAST_DAYS,
  });
  if (!response.ok) {
    return [];
  }
  const mapped = mapOpenMeteoResponse({
    place: entry.place,
    requestedModels: MODEL_ORDER,
    response: response.value,
    now,
    fetchedAt: now.getTime(),
  });
  if (!mapped.ok) {
    return [];
  }
  const cascade = computeCascadeView(
    mapped.value.bundle,
    { terrain: entry.terrain, verification: entry.verification, preferred: entry.preferred },
    now,
  );
  const hits = evaluateAlerts({
    rules,
    placeId: entry.place.id,
    points: cascade.points.filter((point) => point !== null),
    now,
  });
  return hits.map((hit) => ({
    key: alertKey(hit),
    title: `${placeLabel(entry)} · ${ruleSentence(hit.rule, windUnit)}`,
    body: `${capitalize(hitSentence(hit, windUnit))}.`,
    url: `/${sharedPlaceSearch(entry.place)}`,
  }));
}

type VigilanceFetch = ReturnType<typeof fetchVigilance>;

async function vigilanceNotifications(
  entry: WatchEntry,
  now: Date,
  bulletins: Map<string, VigilanceFetch>,
): Promise<readonly WatchNotification[]> {
  const department = entry.department;
  if (department === null) {
    return [];
  }
  // Un bulletin par departement et par veille, meme pour plusieurs lieux.
  let pending = bulletins.get(department.code);
  if (pending === undefined) {
    pending = fetchVigilance(department.code);
    bulletins.set(department.code, pending);
  }
  const result = await pending;
  if (!result.ok) {
    return [];
  }
  const summary = summarizeVigilance(result.value, now);
  return summary.warnings
    .filter((warning) => warning.level >= WATCH_VIGILANCE_MIN_LEVEL)
    .map((warning) => ({
      key: vigilanceKey(department.code, warning),
      title: `Vigilance ${VIGILANCE_LEVEL_WORDS[warning.level]} ${VIGILANCE_PHENOMENON_LABELS[warning.phenomenon]} · ${department.name} (${department.code})`,
      body: `${capitalize(vigilancePeriodPhrase(warning, now))}${warning.coastal ? ', sur le littoral' : ''}. Bulletin Météo-France de ${bulletinTimePhrase(result.value.issuedUtcMs, now)}, pour ${placeLabel(entry)}.`,
      url: `/${sharedPlaceSearch(entry.place)}`,
    }));
}

/**
 * Notifications nouvelles de cette veille, dans l'ordre des lieux. Un lieu
 * dont la prevision ou la vigilance ne repond pas est simplement saute :
 * la veille suivante reessaiera.
 */
export async function collectWatchNotifications(
  state: WatchState,
  now: Date,
): Promise<readonly WatchNotification[]> {
  const seen = new Set(Object.keys(state.notified));
  const fresh: WatchNotification[] = [];
  const bulletins = new Map<string, VigilanceFetch>();
  for (const entry of state.entries) {
    const found = [
      // Meme cle pour deux lieux d'un departement : notifiee une fois.
      ...(await vigilanceNotifications(entry, now, bulletins)),
      ...(await alertNotifications(entry, state.windUnit, now)),
    ];
    for (const notification of found) {
      if (!seen.has(notification.key)) {
        seen.add(notification.key);
        fresh.push(notification);
      }
    }
  }
  return fresh;
}

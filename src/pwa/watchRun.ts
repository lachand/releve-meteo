import { fetchForecast } from '../data/clients/openMeteo';
import { fetchVigilance } from '../data/clients/vigilance';
import { mapOpenMeteoResponse } from '../data/mappers/openMeteoMapper';
import { evaluateAlerts } from '../domain/alerts';
import { briefingAt } from '../domain/briefing';
import { confidenceAt } from '../domain/confidence';
import { dayDigest } from '../domain/dayDigest';
import { evaluateSpreadAlerts } from '../domain/spreadAlerts';
import { MODEL_ORDER } from '../domain/models';
import { summarizeVigilance } from '../domain/vigilance';
import type { ForecastBundle } from '../domain/types';
import {
  DIGEST_MAX_PLACES,
  WATCH_VIGILANCE_MIN_LEVEL,
  alertKey,
  digestDue,
  digestKey,
  spreadKey,
  vigilanceKey,
} from '../domain/watch';
import type { WatchEntry, WatchState } from '../domain/watch';
import { hitSentence, ruleSentence, spreadHitSentence } from '../ui/alertPresentation';
import { computeCascadeView } from '../ui/cascadeView';
import type { CascadeView } from '../ui/cascadeView';
import { digestBody } from '../ui/digestPresentation';
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

interface EntryForecast {
  readonly bundle: ForecastBundle;
  readonly cascade: CascadeView;
}

/** Prevision rechargee d'un lieu et sa cascade : celle de la page, avec les memes intrants. */
async function loadEntryForecast(entry: WatchEntry, now: Date): Promise<EntryForecast | null> {
  const response = await fetchForecast({
    latitude: entry.place.latitude,
    longitude: entry.place.longitude,
    models: MODEL_ORDER,
    pastDays: 0,
    forecastDays: WATCH_FORECAST_DAYS,
  });
  if (!response.ok) {
    return null;
  }
  const mapped = mapOpenMeteoResponse({
    place: entry.place,
    requestedModels: MODEL_ORDER,
    response: response.value,
    now,
    fetchedAt: now.getTime(),
  });
  if (!mapped.ok) {
    return null;
  }
  const bundle = mapped.value.bundle;
  const cascade = computeCascadeView(
    bundle,
    { terrain: entry.terrain, verification: entry.verification, preferred: entry.preferred },
    now,
  );
  return { bundle, cascade };
}

function alertNotifications(
  entry: WatchEntry,
  windUnit: WatchState['windUnit'],
  now: Date,
  forecast: EntryForecast,
): readonly WatchNotification[] {
  const rules = entry.rules.filter((rule) => rule.enabled);
  const { bundle, cascade } = forecast;
  const hits = evaluateAlerts({
    rules,
    placeId: entry.place.id,
    points: cascade.points.filter((point) => point !== null),
    now,
  });
  // Desaccord entre modeles : evalue sur toutes les series, pas sur le modele retenu.
  const spreadHits = evaluateSpreadAlerts({ rules, bundle, now });
  const url = `/${sharedPlaceSearch(entry.place)}`;
  return [
    ...hits.map((hit) => ({
      key: alertKey(hit),
      title: `${placeLabel(entry)} · ${ruleSentence(hit.rule, windUnit)}`,
      body: `${capitalize(hitSentence(hit, windUnit))}.`,
      url,
    })),
    ...spreadHits.map((hit) => ({
      key: spreadKey(hit),
      title: `${placeLabel(entry)} · ${ruleSentence(hit.rule, windUnit)}`,
      body: `${capitalize(spreadHitSentence(hit, windUnit))}.`,
      url,
    })),
  ];
}

/**
 * Resume du matin d'un lieu : le bulletin du moment (modele nomme, ecart des
 * autres chiffre) et les 24 heures a venir. Null quand il n'y a rien a dire.
 */
function digestNotification(
  entry: WatchEntry,
  date: string,
  windUnit: WatchState['windUnit'],
  now: Date,
  forecast: EntryForecast,
): WatchNotification | null {
  const { bundle, cascade } = forecast;
  const nowPoint = cascade.nowIndex === -1 ? null : (cascade.points[cascade.nowIndex] ?? null);
  const briefing =
    nowPoint === null
      ? null
      : briefingAt({
          bundle,
          index: cascade.nowIndex,
          active: { model: nowPoint.model, temperature: nowPoint.temperature.value },
          // Sans terrain connu, pas de verdict de confiance : le bulletin ne l'annonce pas.
          verdict:
            entry.terrain === null ? null : confidenceAt(bundle, cascade.nowIndex, entry.terrain),
        });
  const body = digestBody(
    briefing,
    dayDigest({ points: cascade.points.filter((point) => point !== null), now }),
    windUnit,
  );
  return body === null
    ? null
    : {
        key: digestKey(date, entry.place.id),
        title: `${placeLabel(entry)} · Résumé du matin`,
        body,
        url: `/${sharedPlaceSearch(entry.place)}`,
      };
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
  // Resume du matin : voulu par l'utilisateur, a la premiere veille de la matinee.
  const digestDate = state.digest ? digestDue(now) : null;
  for (const [position, entry] of state.entries.entries()) {
    const digestWanted =
      digestDate !== null &&
      position < DIGEST_MAX_PLACES &&
      !seen.has(digestKey(digestDate, entry.place.id));
    const needsForecast = entry.rules.some((rule) => rule.enabled) || digestWanted;
    const forecast = needsForecast ? await loadEntryForecast(entry, now) : null;
    const found = [
      // Meme cle pour deux lieux d'un departement : notifiee une fois.
      ...(await vigilanceNotifications(entry, now, bulletins)),
      ...(forecast === null ? [] : alertNotifications(entry, state.windUnit, now, forecast)),
      ...(forecast === null || !digestWanted
        ? []
        : [digestNotification(entry, digestDate, state.windUnit, now, forecast)].filter(
            (notification): notification is WatchNotification => notification !== null,
          )),
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

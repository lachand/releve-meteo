import { fetchAirQuality } from '../data/clients/airQuality';
import { fetchForecast } from '../data/clients/openMeteo';
import { fetchVigilance } from '../data/clients/vigilance';
import { mapOpenMeteoResponse } from '../data/mappers/openMeteoMapper';
import { evaluateAlerts } from '../domain/alerts';
import { briefingAt } from '../domain/briefing';
import { confidenceAt } from '../domain/confidence';
import { dayDigest } from '../domain/dayDigest';
import { detectPhenomena } from '../domain/phenomena';
import { evaluateSpreadAlerts } from '../domain/spreadAlerts';
import { MODEL_ORDER } from '../domain/models';
import { localIsoFromUtc } from '../domain/time';
import { summarizeVigilance } from '../domain/vigilance';
import type { ForecastBundle } from '../domain/types';
import {
  DIGEST_MAX_PLACES as NOTICE_MAX_PLACES,
  WATCH_VIGILANCE_MIN_LEVEL,
  alertKey,
  digestKey,
  spreadKey,
  vigilanceKey,
} from '../domain/watch';
import type { WatchEntry, WatchState } from '../domain/watch';
import {
  highPollen,
  morningDue,
  pollenKey,
  rainAhead,
  rainKey,
  violentEpisodes,
  violentKey,
} from '../domain/weatherNotices';
import type { PollenPeak } from '../domain/weatherNotices';
import { hitSentence, ruleSentence, spreadHitSentence } from '../ui/alertPresentation';
import { computeCascadeView } from '../ui/cascadeView';
import type { CascadeView } from '../ui/cascadeView';
import { digestBody } from '../ui/digestPresentation';
import {
  pollenSentence,
  rainSentence,
  violentSentence,
  violentTitle,
} from '../ui/noticePresentation';
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

/** Bulletin du moment et 24 heures a venir, ou null quand il n'y a rien a dire. */
function digestText(
  entry: WatchEntry,
  windUnit: WatchState['windUnit'],
  now: Date,
  forecast: EntryForecast,
): string | null {
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
  return digestBody(
    briefing,
    dayDigest({ points: cascade.points.filter((point) => point !== null), now }),
    windUnit,
  );
}

/** Pollens eleves des prochaines 24 h, liste vide si le service ne repond pas. */
async function loadHighPollen(entry: WatchEntry, now: Date): Promise<readonly PollenPeak[]> {
  const result = await fetchAirQuality(entry.place.latitude, entry.place.longitude);
  return result.ok ? highPollen(result.value.timeline, result.value.pollen, now) : [];
}

/**
 * Risques, pluie et pollens voulus par l'utilisateur, pour un lieu : des
 * notifications distinctes au fil de l'eau (mode « des la detection »), ou
 * leurs phrases pour la notification groupee du matin.
 */
interface Notices {
  readonly risks: readonly {
    readonly key: string;
    readonly title: string;
    readonly body: string;
  }[];
  readonly rain: { readonly key: string; readonly sentence: string } | null;
  readonly pollen: { readonly key: string; readonly sentence: string } | null;
}

function noticesFor(
  entry: WatchEntry,
  now: Date,
  forecast: EntryForecast | null,
  pollen: readonly PollenPeak[],
): Notices {
  const id = entry.place.id;
  const points = forecast?.cascade.points.filter((point) => point !== null) ?? [];
  const rain = rainAhead(points, now);
  return {
    risks: violentEpisodes(detectPhenomena(points), now).map((episode) => ({
      key: violentKey(id, episode),
      title: `${placeLabel(entry)} · ${violentTitle(episode)}`,
      body: violentSentence(episode),
    })),
    rain: rain === null ? null : { key: rainKey(id, rain.start), sentence: rainSentence(rain) },
    pollen:
      pollen.length === 0
        ? null
        : {
            key: pollenKey(id, localIsoFromUtc(now.getTime()).slice(0, 10)),
            sentence: pollenSentence(pollen),
          },
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
  const { notify } = state;
  const morningDate = morningDue(now, notify.hour);
  // Categories voulues, selon le moment : groupees le matin, ou des la detection.
  const grouped = notify.mode === 'morning';
  for (const [position, entry] of state.entries.entries()) {
    const id = entry.place.id;
    const limited = position < NOTICE_MAX_PLACES;
    const url = `/${sharedPlaceSearch(entry.place)}`;
    const morningKey = morningDate === null ? null : digestKey(morningDate, id);
    // Le groupe du matin : resume voulu, ou categories groupees voulues.
    const morningWanted =
      limited &&
      morningKey !== null &&
      !seen.has(morningKey) &&
      (state.digest || (grouped && (notify.risks || notify.rain || notify.pollen)));
    const instantRisks = limited && !grouped && notify.risks;
    const instantRain = limited && !grouped && notify.rain;
    const instantPollen = limited && !grouped && notify.pollen;
    const needsForecast =
      entry.rules.some((rule) => rule.enabled) ||
      (morningWanted && (state.digest || (grouped && (notify.risks || notify.rain)))) ||
      instantRisks ||
      instantRain;
    const forecast = needsForecast ? await loadEntryForecast(entry, now) : null;
    const needsPollen = notify.pollen && ((morningWanted && grouped) || instantPollen);
    const pollen = needsPollen ? await loadHighPollen(entry, now) : [];
    const notices = noticesFor(entry, now, forecast, pollen);

    const found: WatchNotification[] = [
      // Meme cle pour deux lieux d'un departement : notifiee une fois.
      ...(await vigilanceNotifications(entry, now, bulletins)),
      ...(forecast === null ? [] : alertNotifications(entry, state.windUnit, now, forecast)),
    ];
    if (instantRisks) {
      found.push(...notices.risks.map((risk) => ({ ...risk, url })));
    }
    if (instantRain && notices.rain !== null) {
      found.push({
        key: notices.rain.key,
        title: `${placeLabel(entry)} · Pluie à venir`,
        body: notices.rain.sentence,
        url,
      });
    }
    if (instantPollen && notices.pollen !== null) {
      found.push({
        key: notices.pollen.key,
        title: `${placeLabel(entry)} · Pollens élevés`,
        body: notices.pollen.sentence,
        url,
      });
    }
    if (morningWanted && morningKey !== null) {
      const parts = [
        state.digest && forecast !== null ? digestText(entry, state.windUnit, now, forecast) : null,
        grouped && notify.risks && notices.risks.length > 0
          ? notices.risks
              .map((risk) => `${risk.title.split(' · ')[1] ?? ''}\u00a0: ${risk.body}`)
              .join(' ')
          : null,
        grouped && notify.rain ? (notices.rain?.sentence ?? null) : null,
        grouped && notify.pollen ? (notices.pollen?.sentence ?? null) : null,
      ].filter((part): part is string => part !== null);
      if (parts.length > 0) {
        found.push({
          key: morningKey,
          title: `${placeLabel(entry)} · Résumé du matin`,
          body: parts.join(' '),
          url,
        });
      }
    }
    for (const notification of found) {
      if (!seen.has(notification.key)) {
        seen.add(notification.key);
        fresh.push(notification);
      }
    }
  }
  return fresh;
}

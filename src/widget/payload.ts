import { briefingAt } from '../domain/briefing';
import { confidenceAt } from '../domain/confidence';
import { blendDaily } from '../domain/dailyBlend';
import { leadHoursFrom, localIsoFromUtc } from '../domain/time';
import { dayDigest } from '../domain/dayDigest';
import type { ConfidenceLevel, LocalIsoHour, ModelId, WeatherVariable } from '../domain/types';
import type { VigilanceWarning } from '../domain/vigilance';
import type { WatchEntry } from '../domain/watch';
import type { Preferences } from '../domain/types';
import type { EntryForecast } from '../pwa/watchRun';
import { sharedPlaceSearch } from '../ui/sharedPlace';
import { weatherCodeLabel } from '../ui/weatherCodePresentation';
import { mostSevereWeather, weatherIcon } from './icon';
import { widgetNotes } from './notes';
import type { WidgetNote } from './notes';
import type { WidgetIconName } from './icon';

/*
 * Ce que le widget Android affiche, en donnees et non en phrases : le modele
 * retenu, la temperature, l'ecart des autres modeles, la confiance, les
 * prochaines heures. La selection et la confiance sont calculees ici, par le
 * meme code que la page ; le widget natif ne fait que dessiner et ecrire les
 * phrases (WIDGET_ANDROID.md, regle 4). Une grandeur absente reste null.
 */

export const WIDGET_PAYLOAD_VERSION = 1;
/** Heures a venir montrees par le grand widget. */
export const WIDGET_HOURS = 12;
/** Lieux calcules, favoris d'abord : chaque widget en choisit un. */
export const WIDGET_MAX_PLACES = 6;
/** Jours montres par le grand widget, aujourd'hui compris. */
export const WIDGET_DAYS = 4;
/** Heures de la courbe du grand widget, a partir de l'heure en cours. */
export const WIDGET_TRACK_HOURS = 24;

export interface WidgetNow {
  readonly time: LocalIsoHour;
  readonly model: ModelId;
  readonly temperature: number;
  /** Autres modeles qui ont une temperature a cette heure. */
  readonly others: number;
  readonly meanGap: number | null;
  readonly maxGap: number | null;
  /** 'unavailable' : terrain inconnu ou un seul modele, aucun verdict. */
  readonly confidence: ConfidenceLevel | 'unavailable';
  readonly drivers: readonly WeatherVariable[];
  /** Pictogramme du temps du moment, null sans code de temps connu. */
  readonly icon: WidgetIconName | null;
  /** « Partiellement nuageux » : le nom du temps, accompagne toujours l'icone. */
  readonly label: string | null;
  /** Vent moyen, km/h ; null quand le modele retenu n'en donne pas. */
  readonly windSpeed: number | null;
  /** Rafales, km/h. */
  readonly windGust: number | null;
  /** Humidite relative, %. */
  readonly humidity: number | null;
}

/** Une heure de la courbe : la valeur du modele retenu cette heure-la, son nom, jamais un zero a la place d'une absence. */
export interface WidgetTrackPoint {
  readonly time: LocalIsoHour;
  readonly model: ModelId;
  readonly temperature: number | null;
  readonly precipitation: number | null;
}

/** Un jour a venir : un modele retenu par jour, comme la vue « jours » de la page. */
export interface WidgetForecastDay {
  /** AAAA-MM-JJ, heure de Paris. */
  readonly date: string;
  readonly model: ModelId;
  readonly tempMin: number | null;
  readonly tempMax: number | null;
  readonly rainMm: number | null;
  readonly icon: WidgetIconName | null;
  readonly label: string | null;
}

export interface WidgetHour {
  readonly time: LocalIsoHour;
  readonly model: ModelId;
  readonly temperature: number | null;
  readonly precipitation: number | null;
}

export interface WidgetDay {
  readonly tempMin: number | null;
  readonly tempMax: number | null;
  readonly rainMm: number | null;
  readonly gustMax: number | null;
}

export interface WidgetPlace {
  readonly id: string;
  /** Alias donne par l'utilisateur, sinon nom du lieu. */
  readonly name: string;
  /** Chaine de recherche qui ouvre ce lieu dans l'application (`?lat=&lon=&nom=...`). */
  readonly link: string;
  readonly now: WidgetNow | null;
  readonly hours: readonly WidgetHour[];
  readonly day: WidgetDay | null;
  /** Aujourd'hui et les jours suivants, vide sans prevision quotidienne. */
  readonly days: readonly WidgetForecastDay[];
  /** Lever et coucher du soleil d'aujourd'hui (HH:mm, heure de Paris), null sans prevision quotidienne. */
  readonly sun: { readonly sunrise: string | null; readonly sunset: string | null } | null;
  /** Les prochaines heures, une par heure, pour la courbe ; vide sans heure en cours. */
  readonly track: readonly WidgetTrackPoint[];
  /** La ligne du pied : des notes de la plus importante a la moins importante, vide s'il n'y en a pas. */
  readonly notes: readonly WidgetNote[];
}

export interface WidgetPayload {
  readonly version: typeof WIDGET_PAYLOAD_VERSION;
  /** Instant du calcul, epoch ms UTC : le widget en affiche l'age. */
  readonly generatedAtMs: number;
  readonly places: readonly WidgetPlace[];
  /** Lieux dont la prevision n'a pas pu etre lue : le widget garde leur derniere valeur, datee. */
  readonly unreachable: readonly string[];
}

/** Le lieu d'une veille et sa prevision, en donnees de widget. */
export function widgetPlace(input: {
  readonly entry: WatchEntry;
  readonly forecast: EntryForecast;
  readonly now: Date;
  readonly windUnit?: Preferences['units']['wind'];
  /** Vigilances Meteo-France du departement du lieu (jaunes a rouges), vide si inconnues. */
  readonly vigilance?: readonly VigilanceWarning[];
}): WidgetPlace {
  const { entry, forecast, now } = input;
  const { bundle, cascade } = forecast;
  const points = cascade.points.filter((point) => point !== null);
  const today = localIsoFromUtc(now.getTime()).slice(0, 10);
  const nowPoint = cascade.nowIndex === -1 ? null : (cascade.points[cascade.nowIndex] ?? null);
  const briefing =
    nowPoint === null
      ? null
      : briefingAt({
          bundle,
          index: cascade.nowIndex,
          active: { model: nowPoint.model, temperature: nowPoint.temperature.value },
          // Sans terrain connu, pas de verdict de confiance (comme le bulletin de la veille).
          verdict:
            entry.terrain === null ? null : confidenceAt(bundle, cascade.nowIndex, entry.terrain),
        });
  const hours =
    cascade.nowIndex === -1
      ? []
      : cascade.points
          .slice(cascade.nowIndex + 1, cascade.nowIndex + 1 + WIDGET_HOURS)
          .flatMap((point): WidgetHour[] =>
            point === null
              ? []
              : [
                  {
                    time: point.time,
                    model: point.model,
                    temperature: point.temperature.value,
                    precipitation: point.precipitation.value,
                  },
                ],
          );
  const blended = blendDaily({
    bundle,
    context: cascade.context,
    now,
    preferred: entry.preferred,
  }).slice(0, WIDGET_DAYS);
  const days = blended.map((day): WidgetForecastDay => {
    // Aujourd'hui : le temps des heures restantes, comme la phrase « Sur 24 h » ; le resume du
    // jour d'un modele couvre aussi des heures deja passees. Sans code, celui du modele.
    const code =
      day.date === today
        ? (mostSevereWeather(
            points
              .filter(
                (point) => point.time.startsWith(today) && leadHoursFrom(now, point.time) >= -1,
              )
              .map((point) => point.weatherCode),
          ) ?? day.weatherCode)
        : day.weatherCode;
    return {
      date: day.date,
      model: day.model,
      tempMin: day.tempMin.value,
      tempMax: day.tempMax.value,
      rainMm: day.precipitationSum.value,
      icon: weatherIcon(code, true),
      label: weatherCodeLabel(code),
    };
  });
  const todayDay = blended.find((day) => day.date === today);
  const sun =
    todayDay === undefined
      ? null
      : {
          sunrise: todayDay.sunrise === null ? null : todayDay.sunrise.slice(11, 16),
          sunset: todayDay.sunset === null ? null : todayDay.sunset.slice(11, 16),
        };
  const track: WidgetTrackPoint[] =
    cascade.nowIndex === -1
      ? []
      : cascade.points
          .slice(cascade.nowIndex, cascade.nowIndex + WIDGET_TRACK_HOURS)
          .flatMap((point): WidgetTrackPoint[] =>
            point === null
              ? []
              : [
                  {
                    time: point.time,
                    model: point.model,
                    temperature: point.temperature.value,
                    precipitation: point.precipitation.value,
                  },
                ],
          );
  return {
    id: entry.place.id,
    name: entry.place.alias ?? entry.place.name,
    link: sharedPlaceSearch(entry.place),
    now:
      nowPoint === null || briefing === null
        ? null
        : {
            time: nowPoint.time,
            model: briefing.model,
            temperature: briefing.temperature,
            others: briefing.others,
            meanGap: briefing.meanGap,
            maxGap: briefing.maxGap,
            confidence: briefing.confidence,
            drivers: briefing.drivers,
            icon: weatherIcon(nowPoint.weatherCode, nowPoint.isDay),
            label: weatherCodeLabel(nowPoint.weatherCode),
            windSpeed: nowPoint.windSpeed.value,
            windGust: nowPoint.windGust.value,
            humidity: nowPoint.humidity.value,
          },
    hours,
    day: dayDigest({ points, now }),
    days,
    sun,
    track,
    notes: widgetNotes({
      entry,
      forecast,
      now,
      windUnit: input.windUnit ?? 'kmh',
      vigilance: input.vigilance ?? [],
    }),
  };
}

/** Le contenu complet du widget : un lieu par entree lue, les autres signales comme injoignables. */
export function widgetPayload(input: {
  readonly entries: readonly WatchEntry[];
  /** Prevision de chaque lieu, ou null quand elle n'a pas pu etre lue. */
  readonly forecasts: readonly (EntryForecast | null)[];
  readonly now: Date;
  readonly windUnit?: Preferences['units']['wind'];
  /** Vigilances de chaque lieu (meme ordre que `entries`), ou rien. */
  readonly vigilances?: readonly (readonly VigilanceWarning[])[];
}): WidgetPayload {
  const places: WidgetPlace[] = [];
  const unreachable: string[] = [];
  input.entries.forEach((entry, index) => {
    const forecast = input.forecasts[index] ?? null;
    if (forecast === null) {
      unreachable.push(entry.place.id);
    } else {
      places.push(
        widgetPlace({
          entry,
          forecast,
          now: input.now,
          windUnit: input.windUnit,
          vigilance: input.vigilances?.[index],
        }),
      );
    }
  });
  return {
    version: WIDGET_PAYLOAD_VERSION,
    generatedAtMs: input.now.getTime(),
    places,
    unreachable,
  };
}

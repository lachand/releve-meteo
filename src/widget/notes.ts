import type { AlertPoint } from '../domain/alerts';
import { evaluateAlerts } from '../domain/alerts';
import { detectPhenomena } from '../domain/phenomena';
import { modelSpreadAt, evaluateSpreadAlerts } from '../domain/spreadAlerts';
import { leadHoursFrom, localIsoFromUtc } from '../domain/time';
import type { LocalIsoHour, ModelId } from '../domain/types';
import type { VigilanceWarning } from '../domain/vigilance';
import { WATCH_VIGILANCE_MIN_LEVEL } from '../domain/watch';
import type { WatchEntry } from '../domain/watch';
import { RAIN_HOUR_MM, violentEpisodes } from '../domain/weatherNotices';
import type { Preferences } from '../domain/types';
import type { EntryForecast } from '../pwa/watchRun';
import { hitSentence, ruleSentence, spreadHitSentence } from '../ui/alertPresentation';
import {
  formatCompact,
  formatHour,
  formatOneDecimal,
  formatTemperature,
  formatWeekday,
} from '../ui/format';
import { MODEL_LABELS } from '../ui/modelLabels';
import {
  episodePeriod,
  episodeSource,
  PHENOMENON_LABELS,
  RISK_LABELS,
} from '../ui/phenomenaPresentation';
import {
  VIGILANCE_LEVEL_WORDS,
  VIGILANCE_PHENOMENON_LABELS,
  vigilancePeriodPhrase,
} from '../ui/vigilancePresentation';

/*
 * La ligne du pied du widget : des notes, de la plus importante a la moins importante, que le
 * widget montre une a une (la premiere d'abord, un appui passe a la suivante). Chaque note dit
 * sa source (modele, Meteo-France, station) et vient du meme calcul que la page ; le widget
 * natif ne decide de rien. Une note qui ne s'applique pas n'existe pas : jamais de remplissage.
 */

export type WidgetNoteKind =
  'alert' | 'vigilance' | 'phenomenon' | 'rain' | 'reliability' | 'spread';

export interface WidgetNote {
  readonly kind: WidgetNoteKind;
  /** 'alert' : a mettre en avant (couleur d'alerte) ; 'info' : une information. */
  readonly level: 'alert' | 'info';
  /** La phrase complete, source dite. */
  readonly text: string;
  /** Une version courte pour une ligne etroite, sans changer le sens. */
  readonly short: string;
}

/** Notes gardees par lieu. */
export const WIDGET_NOTES_MAX = 6;
/** Fenetre de la note de pluie, heures. */
export const NOTE_RAIN_HOURS = 24;

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** « à 17h », « demain 16h », « jeudi 9h » : le jour dit seulement quand ce n'est pas aujourd'hui. */
function whenPhrase(time: LocalIsoHour, now: Date): string {
  const today = localIsoFromUtc(now.getTime()).slice(0, 10);
  const date = time.slice(0, 10);
  const hour = formatHour(time);
  if (date === today) {
    return `à ${hour}`;
  }
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  return date === tomorrow ? `demain ${hour}` : `${formatWeekday(date)} ${hour}`;
}

export interface NextRain {
  /** Premiere heure pluvieuse dans la fenetre, null quand il ne pleut pas. */
  readonly start: LocalIsoHour | null;
  /** Cumul sur la fenetre, mm ; les heures sans valeur ne comptent pas. */
  readonly totalMm: number;
  /** Modele qui porte la premiere heure pluvieuse, ou la premiere heure connue. */
  readonly model: ModelId;
}

/**
 * Prochaine pluie dans les NOTE_RAIN_HOURS heures, ou null quand aucune heure n'a de valeur de
 * pluie : l'absence de donnee n'est pas du temps sec.
 */
export function nextRain(points: readonly AlertPoint[], now: Date): NextRain | null {
  const window = points.filter((point) => {
    const lead = leadHoursFrom(now, point.time);
    return lead >= -1 && lead <= NOTE_RAIN_HOURS;
  });
  const known = window.filter((point) => point.precipitation.value !== null);
  const [firstKnown] = known;
  if (firstKnown === undefined) {
    return null;
  }
  const first = known.find((point) => (point.precipitation.value ?? 0) >= RAIN_HOUR_MM);
  return {
    start: first?.time ?? null,
    totalMm: known.reduce((sum, point) => sum + (point.precipitation.value ?? 0), 0),
    model: (first ?? firstKnown).model,
  };
}

export function widgetNotes(input: {
  readonly entry: WatchEntry;
  readonly forecast: EntryForecast;
  readonly now: Date;
  readonly windUnit: Preferences['units']['wind'];
  /** Vigilances Meteo-France du departement du lieu, jaunes a rouges, ou vide. */
  readonly vigilance: readonly VigilanceWarning[];
}): readonly WidgetNote[] {
  const { entry, forecast, now, windUnit } = input;
  const { bundle, cascade } = forecast;
  const points = cascade.points.filter((point) => point !== null);
  const notes: WidgetNote[] = [];
  const rules = entry.rules.filter((rule) => rule.enabled);

  // 1. Vos alertes franchies.
  for (const hit of evaluateAlerts({ rules, placeId: entry.place.id, points, now })) {
    notes.push({
      kind: 'alert',
      level: 'alert',
      text: `${ruleSentence(hit.rule, windUnit)} : ${hitSentence(hit, windUnit)}`,
      short: `Alerte : ${lowerFirst(ruleSentence(hit.rule, windUnit))}`,
    });
  }
  for (const hit of evaluateSpreadAlerts({ rules, bundle, now })) {
    notes.push({
      kind: 'alert',
      level: 'alert',
      text: `${ruleSentence(hit.rule, windUnit)} : ${spreadHitSentence(hit, windUnit)}`,
      short: `Alerte : ${lowerFirst(ruleSentence(hit.rule, windUnit))}`,
    });
  }

  // 2. La vigilance officielle, orange et rouge seulement.
  const department = entry.department;
  if (department !== null) {
    for (const warning of input.vigilance.filter((w) => w.level >= WATCH_VIGILANCE_MIN_LEVEL)) {
      const label = `Vigilance ${VIGILANCE_LEVEL_WORDS[warning.level]} ${VIGILANCE_PHENOMENON_LABELS[warning.phenomenon]}`;
      notes.push({
        kind: 'vigilance',
        level: 'alert',
        text: `${label} (${department.name}) : ${vigilancePeriodPhrase(warning, now)}. Source Météo-France.`,
        short: label,
      });
    }
  }

  // 3. Les phenomenes violents a venir, calcules par Relevé.
  for (const episode of violentEpisodes(detectPhenomena(points), now)) {
    const source = episodeSource(episode);
    notes.push({
      kind: 'phenomenon',
      level: episode.level === 'high' ? 'alert' : 'info',
      text: `${PHENOMENON_LABELS[episode.kind]} possible, ${episodePeriod(episode)}, niveau ${RISK_LABELS[episode.level]}${source === null ? '' : `, ${source}`}.`,
      short: `${PHENOMENON_LABELS[episode.kind]} ${whenPhrase(episode.start, now)}`,
    });
  }

  // 4. La pluie des 24 prochaines heures, ou son absence.
  const rain = nextRain(points, now);
  if (rain !== null) {
    const source = `selon ${MODEL_LABELS[rain.model]}`;
    notes.push(
      rain.start === null
        ? {
            kind: 'rain',
            level: 'info',
            text: `Pas de pluie sur les ${NOTE_RAIN_HOURS} prochaines heures, ${source}.`,
            short: `Sec sur ${NOTE_RAIN_HOURS} h`,
          }
        : {
            kind: 'rain',
            level: 'info',
            text: `Pluie ${whenPhrase(rain.start, now)}, ${formatCompact(rain.totalMm)} mm sur ${NOTE_RAIN_HOURS} h, ${source}.`,
            short: `Pluie ${whenPhrase(rain.start, now)}`,
          },
    );
  }

  // 5. Ce que vaut ici le modele retenu, mesure sur les 30 derniers jours.
  const nowPoint = cascade.nowIndex === -1 ? null : (cascade.points[cascade.nowIndex] ?? null);
  if (nowPoint !== null) {
    const verification = entry.verification
      .filter(
        (v) =>
          v.model === nowPoint.model &&
          v.variable === 'temperature' &&
          v.status === 'ready' &&
          v.stats !== null,
      )
      .sort((a, b) => a.leadDays - b.leadDays)[0];
    if (verification?.stats) {
      const reference =
        verification.reference === 'observed'
          ? 'mesures de la station'
          : 'réanalyse ERA5, estimation';
      const model = MODEL_LABELS[nowPoint.model];
      notes.push({
        kind: 'reliability',
        level: 'info',
        text: `${model} : ${formatOneDecimal(verification.stats.mae)} °C d’erreur moyenne ici, d’après les ${reference} (${verification.sampleCount} heures).`,
        short: `${model} : ${formatOneDecimal(verification.stats.mae)} °C d’erreur ici`,
      });
    }

    // 6. La fourchette des modeles a l'heure du bulletin.
    const spread = modelSpreadAt(bundle, cascade.nowIndex, 'temperature');
    if (spread !== null && Math.round(spread.high.value) !== Math.round(spread.low.value)) {
      notes.push({
        kind: 'spread',
        level: 'info',
        text: `À ${formatHour(nowPoint.time)}, les modèles vont de ${formatTemperature(spread.low.value)} °C (${MODEL_LABELS[spread.low.model]}) à ${formatTemperature(spread.high.value)} °C (${MODEL_LABELS[spread.high.model]}).`,
        short: `Modèles : ${formatTemperature(spread.low.value)} à ${formatTemperature(spread.high.value)} °C`,
      });
    }
  }

  return notes
    .map((note) => ({ ...note, text: capitalize(note.text), short: capitalize(note.short) }))
    .slice(0, WIDGET_NOTES_MAX);
}

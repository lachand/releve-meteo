import type { PhenomenonEpisode } from '../domain/phenomena';
import type { LightningNear } from '../domain/lightning';
import type { PollenPeak, RainAhead } from '../domain/weatherNotices';
import { POLLEN_LABELS } from './airQualityPresentation';
import { formatDayHour, formatInteger, formatOneDecimal } from './format';
import { MODEL_LABELS } from './modelLabels';
import {
  PHENOMENON_LABELS,
  RISK_LABELS,
  episodePeriod,
  evidenceSentence,
} from './phenomenaPresentation';

/*
 * Textes des notifications de risques, de pluie et de pollens : chacun nomme
 * sa source (modele de prevision, ou CAMS pour les pollens), jamais un
 * « il va pleuvoir » sans dire qui le calcule.
 */

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** « Orage, risque fort ». */
export function violentTitle(episode: PhenomenonEpisode): string {
  return `${PHENOMENON_LABELS[episode.kind]}, risque ${RISK_LABELS[episode.level]}`;
}

/** « Mardi 14h à 18h. Énergie convective jusqu’à 1 800 J/kg. Selon AROME. » */
export function violentSentence(episode: PhenomenonEpisode): string {
  const source = episode.model === null ? '' : ` Selon ${MODEL_LABELS[episode.model]}.`;
  return `${capitalize(episodePeriod(episode))}. ${evidenceSentence(episode)}${source}`;
}

/** « Pluie attendue dès lundi 13h selon AROME : 3,2 mm sur 24 h. » */
export function rainSentence(rain: RainAhead): string {
  return `Pluie attendue dès ${formatDayHour(rain.start)} selon ${MODEL_LABELS[rain.model]}\u00a0: ${formatOneDecimal(rain.totalMm)}\u00a0mm sur 24\u00a0h.`;
}

const lightningTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * « Éclairs vus par le satellite MTG à environ 15 km, entre 15:10 et 15:20
 * (4 zones de 2 km). Observation optique : pas un impact au sol. »
 */
export function lightningSentence(near: LightningNear): string {
  const distance =
    near.nearestKm < 3 ? 'sur place' : `à environ ${Math.round(near.nearestKm)}\u00a0km`;
  const period =
    near.firstTime === near.lastTime
      ? `à ${lightningTime.format(new Date(near.firstTime))}`
      : `entre ${lightningTime.format(new Date(near.firstTime))} et ${lightningTime.format(new Date(near.lastTime))}`;
  const zones = near.cells > 1 ? `${near.cells} zones de 2\u00a0km` : '1 zone de 2\u00a0km';
  return `Éclairs vus par le satellite MTG ${distance}, ${period} (${zones}). Observation optique, pas un impact localisé au sol.`;
}

function pollenName(kind: string): string {
  return (POLLEN_LABELS as Readonly<Record<string, string>>)[kind] ?? kind;
}

/** « Pollens élevés : Bouleau (150 grains/m³), Graminées (80 grains/m³). Prévision CAMS Europe. » */
export function pollenSentence(peaks: readonly PollenPeak[]): string {
  const list = peaks
    .map(
      (peak) => `${pollenName(peak.kind)} (${formatInteger(Math.round(peak.peak))}\u00a0grains/m³)`,
    )
    .join(', ');
  return `Pollens élevés\u00a0: ${list}. Prévision CAMS Europe.`;
}

import type { PhenomenonEpisode, PhenomenonKind, RiskLevel } from '../domain/phenomena';
import {
  formatCompact,
  formatDayHour,
  formatHour,
  formatInteger,
  formatTemperature,
} from './format';
import { MODEL_LABELS } from './modelPresentation';

export const PHENOMENON_LABELS: Readonly<Record<PhenomenonKind, string>> = {
  thunderstorm: 'Orage',
  heavyRain: 'Forte pluie',
  snow: 'Neige',
  freezingRain: 'Pluie verglaçante',
  frost: 'Gel',
  fog: 'Brouillard',
  strongWind: 'Vent fort',
  heat: 'Chaleur',
};

export const RISK_LABELS: Readonly<Record<RiskLevel, string>> = {
  low: 'faible',
  moderate: 'modéré',
  high: 'fort',
};

/** Code WMO representatif, pour le pictogramme ; null si pictogramme dedie. */
export const PHENOMENON_SYMBOL: Readonly<Record<PhenomenonKind, number | null>> = {
  thunderstorm: 95,
  heavyRain: 65,
  snow: 73,
  freezingRain: 67,
  frost: null,
  fog: 45,
  strongWind: null,
  heat: null,
};

/** Grandeur de pointe, redigee : « rafales jusqu'a 85 km/h ». */
export function evidenceSentence(episode: PhenomenonEpisode): string {
  const peak = episode.evidence.peakValue;
  const cape = episode.evidence.cape;
  switch (episode.kind) {
    case 'thunderstorm':
      return cape === null
        ? 'Code de temps orageux.'
        : `Énergie convective (CAPE) jusqu’à ${formatInteger(cape)} J/kg.`;
    case 'heavyRain':
      return `Jusqu’à ${formatCompact(peak)} mm en une heure.`;
    case 'snow':
      return peak === null
        ? 'Code de temps neigeux.'
        : `Jusqu’à ${formatCompact(peak)} cm en une heure.`;
    case 'freezingRain':
      return peak === null
        ? 'Code de pluie ou bruine verglaçante.'
        : `Pluie par ${formatTemperature(peak)} °C.`;
    case 'frost':
      return `Minimum ${formatTemperature(peak)} °C.`;
    case 'fog':
      return peak === null
        ? 'Air saturé et vent faible.'
        : `Visibilité jusqu’à ${formatInteger(peak)} m.`;
    case 'strongWind':
      return `Rafales jusqu’à ${formatInteger(peak)} km/h.`;
    case 'heat':
      return `Jusqu’à ${formatTemperature(peak)} °C.`;
  }
}

/** « mardi 14h à mardi 18h » ou « mardi 14h » pour une heure seule. */
export function episodePeriod(episode: PhenomenonEpisode): string {
  if (episode.start === episode.end) {
    return formatDayHour(episode.start);
  }
  const sameDay = episode.start.slice(0, 10) === episode.end.slice(0, 10);
  return sameDay
    ? `${formatDayHour(episode.start)} à ${formatHour(episode.end)}`
    : `${formatDayHour(episode.start)} à ${formatDayHour(episode.end)}`;
}

export function episodeSource(episode: PhenomenonEpisode): string | null {
  return episode.model === null ? null : `selon ${MODEL_LABELS[episode.model]}`;
}

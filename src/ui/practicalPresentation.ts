import type {
  CriterionKey,
  IndexCriterion,
  IndexId,
  PracticalIndices,
  Status,
} from '../domain/practicalIndices';
import type { Preferences } from '../domain/types';
import { formatCompact, formatHour, formatInteger } from './format';
import { MODEL_LABELS } from './modelLabels';
import { convertWindSpeed, windUnitLabel } from './windUnit';

/*
 * Mots des indices pratiques. Un verdict n'est jamais donne seul : chaque
 * critere dit la valeur lue et les seuils qui l'ont classee.
 */

export const INDEX_LABELS: Readonly<Record<IndexId, string>> = {
  cycling: 'Vélo',
  hiking: 'Randonnée',
  laundry: 'Linge qui sèche',
  gardening: 'Jardinage',
};

export const VERDICT_WORDS: Readonly<Record<Status | 'unknown', string>> = {
  good: 'Favorable',
  fair: 'Passable',
  poor: 'Défavorable',
  unknown: 'Indéterminé',
};

const CRITERION_LABELS: Readonly<Record<CriterionKey, string>> = {
  rain: 'Pluie cumulée',
  gust: 'Rafale maximale',
  tempMin: 'Température la plus basse',
  tempMax: 'Température la plus haute',
  humidity: 'Humidité moyenne',
  wind: 'Vent moyen',
};

type WindUnit = Preferences['units']['wind'];

/** Valeur et seuils dans l'unite d'affichage. */
function shown(key: CriterionKey, value: number, windUnit: WindUnit): string {
  switch (key) {
    case 'rain':
      return `${formatCompact(value)}\u00a0mm`;
    case 'gust':
    case 'wind':
      return `${formatInteger(convertWindSpeed(value, windUnit))}\u00a0${windUnitLabel(windUnit)}`;
    case 'humidity':
      return `${formatInteger(value)}\u00a0%`;
    case 'tempMin':
    case 'tempMax':
      return `${formatCompact(value)}\u00a0°C`;
  }
}

export function criterionSentence(criterion: IndexCriterion, windUnit: WindUnit): string {
  const { key, kind } = criterion;
  const word = kind === 'max' ? 'jusqu’à' : 'dès';
  const limits = `(favorable ${word} ${shown(key, criterion.good, windUnit)}, passable ${word} ${shown(key, criterion.fair, windUnit)})`;
  const value =
    criterion.value === null
      ? 'inconnue, au moins une heure sans valeur'
      : shown(key, criterion.value, windUnit);
  return `${CRITERION_LABELS[key]} : ${value} ${limits}.`;
}

export function windowSentence(indices: PracticalIndices): string {
  const day = indices.day === 'today' ? 'd’aujourd’hui' : 'de demain';
  const models = indices.models.map((model) => MODEL_LABELS[model]).join(', puis ');
  return `Jugé sur les heures de jour ${day}, de ${formatHour(indices.start)} à ${formatHour(indices.end)} (${indices.hours} h), selon ${models}.`;
}

import type {
  DayPrediction,
  FieldStats,
  ModelComparison,
  OwnReading,
  ReadingProblem,
  ReadingsComparison,
} from '../domain/ownReadings';
import { formatCompact, formatInteger, formatOneDecimal } from './format';
import { MODEL_LABELS } from './modelPresentation';

/*
 * Phrases de Mon relevé. Chaque valeur dit d'ou elle vient : « vous » pour ce
 * que vous avez mesure (observed), « prevu la veille » pour les modeles
 * (forecast). Un champ vide s'affiche par un tiret, jamais par un zero.
 */

const NBSP = ' ';

export const READING_PROBLEMS: Readonly<Record<ReadingProblem, string>> = {
  empty: 'Saisissez au moins une mesure : maximum, minimum ou pluie.',
  range:
    'Une valeur est hors des bornes plausibles (température de −60 à 60 °C, pluie de 0 à 500 mm).',
  order: 'Le maximum ne peut pas être sous le minimum.',
  date: 'Choisissez un jour qui a commencé : pas de saisie pour demain.',
};

/** « 21 / 9 °C · 2,4 mm » ; un champ absent n'est pas ecrit, et tout absent donne un tiret. */
export function valuesText(values: {
  readonly tempMax: number | null;
  readonly tempMin: number | null;
  readonly rain: number | null;
}): string {
  const parts: string[] = [];
  if (values.tempMax !== null || values.tempMin !== null) {
    const max = values.tempMax === null ? '–' : formatCompact(Math.round(values.tempMax * 10) / 10);
    const min = values.tempMin === null ? '–' : formatCompact(Math.round(values.tempMin * 10) / 10);
    parts.push(`${max} / ${min}${NBSP}°C`);
  }
  if (values.rain !== null) {
    parts.push(`${formatCompact(Math.round(values.rain * 10) / 10)}${NBSP}mm`);
  }
  return parts.length === 0 ? '–' : parts.join(' · ');
}

export function readingText(reading: OwnReading): string {
  return valuesText(reading);
}

export function predictionText(prediction: DayPrediction): string {
  return valuesText(prediction);
}

function biasWord(bias: number, high: string, low: string): string {
  const rounded = Math.round(bias * 10) / 10;
  if (rounded === 0) {
    return 'sans écart moyen';
  }
  return `${formatOneDecimal(Math.abs(rounded))}${NBSP}${rounded > 0 ? high : low} en moyenne`;
}

function fieldLine(
  label: string,
  stats: FieldStats | null,
  unit: string,
  high: string,
  low: string,
): string | null {
  if (stats === null) {
    return null;
  }
  return `${label} ${formatOneDecimal(stats.mae)}${NBSP}${unit} d’écart moyen (${biasWord(stats.bias, high, low)}) sur ${formatInteger(stats.values)}${NBSP}valeur${stats.values > 1 ? 's' : ''}`;
}

/** « AROME : thermomètre 0,8 °C d'écart moyen (0,3 °C trop haut en moyenne) sur 6 valeurs ; pluviomètre ... ». */
export function modelLine(comparison: ModelComparison): string {
  const parts = [
    fieldLine('thermomètre', comparison.temperature, '°C', '°C trop haut', '°C trop bas'),
    fieldLine('pluviomètre', comparison.rain, 'mm', 'mm de trop', 'mm de moins'),
  ].filter((part): part is string => part !== null);
  return `${MODEL_LABELS[comparison.model]} : ${parts.join(' ; ')}`;
}

/** Une phrase pour le classement, ou pourquoi il n'y en a pas encore. */
export function comparisonHeadline(result: ReadingsComparison): string {
  if (result.compared === 0) {
    return 'Aucune de vos saisies n’est encore comparable : un jour fini, avec la prévision que chaque modèle en donnait la veille, la rend comparable dès le lendemain.';
  }
  const days = `${formatInteger(result.compared)}${NBSP}jour${result.compared > 1 ? 's' : ''}`;
  const [first, ...others] = result.models.filter((m) => m.temperature !== null);
  if (first === undefined || first.temperature === null) {
    return `Sur ${days} de votre relevé, aucune température n’a pu être comparée : seule la pluie l’a été.`;
  }
  const rest = others
    .slice(0, 2)
    .map((m) => `${MODEL_LABELS[m.model]} ${formatOneDecimal(m.temperature?.mae ?? 0)}${NBSP}°C`)
    .join(', ');
  return `Sur ${days} de votre relevé, ${MODEL_LABELS[first.model]} a été le plus proche de votre thermomètre (${formatOneDecimal(first.temperature.mae)}${NBSP}°C d’écart moyen)${rest === '' ? '' : `, puis ${rest}`}.`;
}

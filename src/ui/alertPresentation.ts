import type { AlertHit } from '../domain/alerts';
import type { SpreadHit } from '../domain/spreadAlerts';
import type { AlertRule, Preferences, WeatherVariable } from '../domain/types';
import { formatCompact, formatDayHour } from './format';
import { MODEL_LABELS } from './modelLabels';
import { convertWindSpeed, windUnitLabel } from './windUnit';

/*
 * Textes des alertes personnelles : la regle en une phrase, et ce que la
 * prevision en dit (quand, jusqu'ou, selon quel modele).
 */

type WindUnit = Preferences['units']['wind'];

export const ALERT_VARIABLE_LABELS: Readonly<Record<WeatherVariable, string>> = {
  temperature: 'Température',
  precipitation: 'Pluie en une heure',
  wind: 'Rafales',
};

export const ALERT_COMPARATOR_LABELS: Readonly<Record<AlertRule['comparator'], string>> = {
  lt: 'sous',
  gt: 'au-dessus de',
};

export function alertUnit(variable: WeatherVariable, windUnit: WindUnit): string {
  switch (variable) {
    case 'temperature':
      return '°C';
    case 'precipitation':
      return 'mm';
    case 'wind':
      return windUnitLabel(windUnit);
  }
}

/** Valeur dans l'unite d'affichage : le vent suit le reglage km/h ou noeuds. */
function display(variable: WeatherVariable, value: number, windUnit: WindUnit): string {
  const shown = variable === 'wind' ? (convertWindSpeed(value, windUnit) ?? value) : value;
  return `${formatCompact(Math.round(shown * 10) / 10)}\u00a0${alertUnit(variable, windUnit)}`;
}

/** Grandeur d'une regle d'ecart, a la suite de « modeles en desaccord sur ». */
const SPREAD_SUBJECTS: Readonly<Record<WeatherVariable, string>> = {
  temperature: 'la température',
  precipitation: 'la pluie en une heure',
  wind: 'les rafales',
};

/** « Rafales au-dessus de 60 km/h », ou « Modèles en désaccord de plus de 3 °C sur la température ». */
export function ruleSentence(rule: AlertRule, windUnit: WindUnit): string {
  if (rule.kind === 'spread') {
    return `Modèles en désaccord de plus de ${display(rule.variable, rule.threshold, windUnit)} sur ${SPREAD_SUBJECTS[rule.variable]}`;
  }
  return `${ALERT_VARIABLE_LABELS[rule.variable]} ${ALERT_COMPARATOR_LABELS[rule.comparator]} ${display(rule.variable, rule.threshold, windUnit)}`;
}

/**
 * « dès mardi 6h, jusqu'à 71 km/h mardi 7h selon ARPEGE, 2 h au total ».
 * Le modele nomme est celui de la valeur extreme.
 */
export function hitSentence(hit: AlertHit, windUnit: WindUnit): string {
  const { rule, first, extreme } = hit;
  const peak =
    extreme.time === first.time
      ? `${display(rule.variable, extreme.value, windUnit)} selon ${MODEL_LABELS[extreme.model]}`
      : `jusqu’à ${display(rule.variable, extreme.value, windUnit)} ${formatDayHour(extreme.time)} selon ${MODEL_LABELS[extreme.model]}`;
  const duration = hit.hours === 1 ? 'une heure' : `${hit.hours}\u00a0h au total`;
  return `dès ${formatDayHour(first.time)}, ${peak}, ${duration}`;
}

/**
 * « dès mardi 6h, jusqu'à 6 °C d'écart mardi 7h (ARPEGE 16 °C, GFS 10 °C),
 * 3 h au total ». Les deux modeles nommes sont les extremes de l'heure du
 * plus grand ecart.
 */
export function spreadHitSentence(hit: SpreadHit, windUnit: WindUnit): string {
  const { rule, first, extreme } = hit;
  const variable = rule.variable;
  const sides = `${MODEL_LABELS[extreme.high.model]} ${display(variable, extreme.high.value, windUnit)}, ${MODEL_LABELS[extreme.low.model]} ${display(variable, extreme.low.value, windUnit)}`;
  const peak =
    extreme.time === first.time
      ? `${display(variable, extreme.spread, windUnit)} d’écart (${sides})`
      : `jusqu’à ${display(variable, extreme.spread, windUnit)} d’écart ${formatDayHour(extreme.time)} (${sides})`;
  const duration = hit.hours === 1 ? 'une heure' : `${hit.hours}\u00a0h au total`;
  return `dès ${formatDayHour(first.time)}, ${peak}, ${duration}`;
}

import type { AirHit } from '../domain/airAlerts';
import type { AlertHit } from '../domain/alerts';
import { ALERT_HORIZON_HOURS } from '../domain/alerts';
import type { ProbabilityHit } from '../domain/probabilityAlerts';
import type { SpreadHit } from '../domain/spreadAlerts';
import type {
  AirAlertRule,
  AirVariable,
  AlertRule,
  Preferences,
  WeatherVariable,
} from '../domain/types';
import { POLLEN_LABELS } from './airQualityPresentation';
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

export const AIR_VARIABLE_LABELS: Readonly<Record<AirVariable, string>> = {
  uv: 'Indice UV',
  aqi: 'Indice européen de qualité de l’air',
  pm25: 'Particules fines PM2,5',
  pollen: 'Pollens',
};

/** Unite d'une grandeur d'air ; vide pour les indices, qui n'en ont pas. */
export const AIR_UNITS: Readonly<Record<AirVariable, string>> = {
  uv: '',
  aqi: '',
  pm25: 'µg/m³',
  pollen: 'grains/m³',
};

function airDisplay(variable: AirVariable, value: number): string {
  const unit = AIR_UNITS[variable];
  const text = formatCompact(Math.round(value * 10) / 10);
  return unit === '' ? text : `${text}\u00a0${unit}`;
}

function pollenName(kind: string): string {
  return ((POLLEN_LABELS as Readonly<Record<string, string>>)[kind] ?? kind).toLowerCase();
}

/**
 * « dès mardi 11h, jusqu'à 8 mardi 13h (bouleau), 3 h au total, prévision CAMS
 * Europe » : la source est nommee, il n'y a pas de cascade de modeles.
 */
export function airHitSentence(hit: AirHit): string {
  const { rule, first, extreme } = hit;
  const who = (pollen: string | null) => (pollen === null ? '' : ` (${pollenName(pollen)})`);
  const peak =
    extreme.time === first.time
      ? `${airDisplay(rule.variable, extreme.value)}${who(extreme.pollen)}`
      : `jusqu’à ${airDisplay(rule.variable, extreme.value)} ${formatDayHour(extreme.time)}${who(extreme.pollen)}`;
  const duration = hit.hours === 1 ? 'une heure' : `${hit.hours}\u00a0h au total`;
  return `dès ${formatDayHour(first.time)}, ${peak}, ${duration}, prévision CAMS Europe`;
}

function airRuleSentence(rule: AirAlertRule): string {
  return `${AIR_VARIABLE_LABELS[rule.variable]} au-dessus de ${airDisplay(rule.variable, rule.threshold)}`;
}

/** « 40 % » : la part est arrondie, jamais presentee comme une probabilite etalonnee. */
function percent(points: number): string {
  return `${Math.round(points)}\u00a0%`;
}

/** « Rafales au-dessus de 60 km/h », ou « Modèles en désaccord de plus de 3 °C sur la température ». */
export function ruleSentence(rule: AlertRule, windUnit: WindUnit): string {
  if (rule.kind === 'air') {
    return airRuleSentence(rule);
  }
  if (rule.kind === 'probability') {
    return `${ALERT_VARIABLE_LABELS[rule.variable]} ${ALERT_COMPARATOR_LABELS[rule.comparator]} ${display(rule.variable, rule.threshold, windUnit)} pour au moins ${percent(rule.probability ?? 0)} des scénarios de l’ensemble`;
  }
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

/**
 * « dès mardi 4h, jusqu'à 62 % des 51 scénarios de l'ensemble ECMWF mardi 6h, 3 h
 * au total, et 82 % des scénarios au moins une fois sur 72 h ». Une part de
 * scénarios, pas un risque etalonne : la source est nommee.
 */
export function probabilityHitSentence(hit: ProbabilityHit): string {
  const { first, peak } = hit;
  const scenarios = `des ${hit.memberCount} scénarios de l’ensemble ECMWF`;
  const share = (value: number) => percent(value * 100);
  const body =
    peak.time === first.time
      ? `${share(peak.share)} ${scenarios}`
      : `jusqu’à ${share(peak.share)} ${scenarios} ${formatDayHour(peak.time)}`;
  const duration = hit.hours === 1 ? 'une heure' : `${hit.hours}\u00a0h au total`;
  return `dès ${formatDayHour(first.time)}, ${body}, ${duration}, et ${share(hit.anyTime)} des scénarios au moins une fois sur ${ALERT_HORIZON_HOURS}\u00a0h`;
}

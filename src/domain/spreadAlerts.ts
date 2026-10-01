import { ALERT_HORIZON_HOURS } from './alerts';
import { MODEL_ORDER } from './models';
import { leadHoursFrom } from './time';
import type {
  AlertRule,
  ForecastBundle,
  HourlyPoint,
  LocalIsoHour,
  ModelId,
  WeatherVariable,
} from './types';

/*
 * Alerte « modeles en desaccord » : le seuil porte sur l'ecart entre les
 * modeles, pas sur une valeur. C'est la mesure d'incertitude que l'application
 * montre deja (confiance, bande de dispersion), en unites physiques : degres,
 * km/h de rafales, mm par heure, avec les deux modeles extremes nommes.
 */

/** Champ comparé, comme pour les alertes de valeur : rafales pour le vent. */
const FIELD: Readonly<Record<WeatherVariable, 'temperature' | 'precipitation' | 'windGust'>> = {
  temperature: 'temperature',
  precipitation: 'precipitation',
  wind: 'windGust',
};

export interface ModelValue {
  readonly model: ModelId;
  readonly value: number;
}

export interface ModelSpread {
  readonly variable: WeatherVariable;
  /** Valeur la plus haute moins la plus basse, dans l'unite de la grandeur. */
  readonly spread: number;
  readonly modelCount: number;
  readonly high: ModelValue;
  readonly low: ModelValue;
}

function fieldValue(point: HourlyPoint, variable: WeatherVariable): number | null {
  return point[FIELD[variable]].value;
}

/**
 * Ecart entre les modeles a un index de la timeline, ou null quand moins de
 * deux modeles ont une valeur : une valeur absente n'est jamais un zero.
 */
export function modelSpreadAt(
  bundle: ForecastBundle,
  index: number,
  variable: WeatherVariable,
): ModelSpread | null {
  const values: ModelValue[] = [];
  for (const model of MODEL_ORDER) {
    const point = bundle.series[model]?.hourly[index];
    const value = point === undefined ? null : fieldValue(point, variable);
    if (value !== null) {
      values.push({ model, value });
    }
  }
  const [first] = values;
  if (first === undefined || values.length < 2) {
    return null;
  }
  const high = values.reduce((best, v) => (v.value > best.value ? v : best), first);
  const low = values.reduce((best, v) => (v.value < best.value ? v : best), first);
  return { variable, spread: high.value - low.value, modelCount: values.length, high, low };
}

export interface SpreadCrossing extends ModelSpread {
  readonly time: LocalIsoHour;
}

export interface SpreadHit {
  readonly rule: AlertRule;
  /** Premiere heure ou l'ecart depasse le seuil. */
  readonly first: SpreadCrossing;
  /** Heure du plus grand ecart sur l'horizon. */
  readonly extreme: SpreadCrossing;
  /** Nombre d'heures au-dela du seuil. */
  readonly hours: number;
}

/**
 * Regles d'ecart actives de ce lieu depassees dans l'horizon d'alerte, dans
 * l'ordre des regles. Evaluees sur toutes les series du bundle, pas sur le
 * modele retenu : c'est leur desaccord que la regle surveille.
 */
export function evaluateSpreadAlerts(input: {
  readonly rules: readonly AlertRule[];
  readonly bundle: ForecastBundle;
  readonly now: Date;
}): readonly SpreadHit[] {
  const { bundle } = input;
  const upcoming = bundle.timeline.flatMap((time, index) => {
    const lead = leadHoursFrom(input.now, time);
    return lead >= 0 && lead <= ALERT_HORIZON_HOURS ? [{ time, index }] : [];
  });
  return input.rules
    .filter((rule) => rule.enabled && rule.kind === 'spread' && rule.placeId === bundle.place.id)
    .flatMap((rule): SpreadHit[] => {
      const crossings = upcoming.flatMap(({ time, index }): SpreadCrossing[] => {
        const spread = modelSpreadAt(bundle, index, rule.variable);
        return spread !== null && spread.spread > rule.threshold ? [{ ...spread, time }] : [];
      });
      const [first] = crossings;
      if (first === undefined) {
        return [];
      }
      const extreme = crossings.reduce((best, c) => (c.spread > best.spread ? c : best), first);
      return [{ rule, first, extreme, hours: crossings.length }];
    });
}

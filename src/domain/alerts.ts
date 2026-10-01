import { leadHoursFrom } from './time';
import type {
  AlertRule,
  HourlyPoint,
  LocalIsoHour,
  ModelId,
  WeatherAlertRule,
  WeatherVariable,
} from './types';

/*
 * Alertes personnelles : des seuils choisis par l'utilisateur pour un lieu
 * (gel sous 2 °C, rafales au-dessus de 60 km/h...), evalues a chaque
 * ouverture sur la prevision du modele retenu heure par heure, et par le
 * service worker quand la veille en arriere-plan est active (watch.ts).
 */

/** Horizon d'evaluation, heures. */
export const ALERT_HORIZON_HOURS = 72;

/**
 * Point horaire du modele retenu : la valeur, son modele, et le modele qui
 * a complete un champ absent (meme contrat que modelCascade.BlendedPoint).
 */
export type AlertPoint = HourlyPoint & {
  readonly model: ModelId;
  readonly filledFrom?: Readonly<Partial<Record<keyof HourlyPoint, ModelId>>>;
};

export interface AlertCrossing {
  readonly time: LocalIsoHour;
  readonly value: number;
  readonly model: ModelId;
}

export interface AlertHit {
  readonly rule: WeatherAlertRule;
  /** Premiere heure ou le seuil est franchi. */
  readonly first: AlertCrossing;
  /** Valeur la plus extreme au-dela du seuil sur l'horizon. */
  readonly extreme: AlertCrossing;
  /** Nombre d'heures au-dela du seuil. */
  readonly hours: number;
}

/** Champ compare : pluie de l'heure, rafales pour le vent. */
const FIELD: Readonly<Record<WeatherVariable, 'temperature' | 'precipitation' | 'windGust'>> = {
  temperature: 'temperature',
  precipitation: 'precipitation',
  wind: 'windGust',
};

/** Regle sur une grandeur de prevision des modeles (pas sur l'air, les pollens ou l'UV). */
export function isWeatherRule(rule: AlertRule): rule is WeatherAlertRule {
  return rule.kind !== 'air';
}

function crosses(value: number, rule: WeatherAlertRule): boolean {
  return rule.comparator === 'lt' ? value < rule.threshold : value > rule.threshold;
}

/**
 * Regles de valeur actives de ce lieu franchies dans l'horizon, dans l'ordre
 * des regles (les regles d'ecart entre modeles sont dans spreadAlerts.ts).
 * Une valeur absente ne declenche jamais rien.
 */
export function evaluateAlerts(input: {
  readonly rules: readonly AlertRule[];
  readonly placeId: string;
  readonly points: readonly AlertPoint[];
  readonly now: Date;
}): readonly AlertHit[] {
  const upcoming = input.points.filter((point) => {
    const lead = leadHoursFrom(input.now, point.time);
    return lead >= 0 && lead <= ALERT_HORIZON_HOURS;
  });
  return input.rules
    .filter(isWeatherRule)
    .filter((rule) => rule.enabled && rule.placeId === input.placeId && rule.kind !== 'spread')
    .flatMap((rule): AlertHit[] => {
      const field = FIELD[rule.variable];
      const crossings = upcoming.flatMap((point): AlertCrossing[] => {
        const value = point[field].value;
        // Le modele nomme est celui qui a fourni la valeur, complement compris.
        const model = point.filledFrom?.[field] ?? point.model;
        return value !== null && crosses(value, rule) ? [{ time: point.time, value, model }] : [];
      });
      const first = crossings[0];
      if (first === undefined) {
        return [];
      }
      const extreme = crossings.reduce((best, crossing) =>
        (rule.comparator === 'lt' ? crossing.value < best.value : crossing.value > best.value)
          ? crossing
          : best,
      );
      return [{ rule, first, extreme, hours: crossings.length }];
    });
}

import { ALERT_HORIZON_HOURS } from './alerts';
import { leadHoursFrom } from './time';
import type { AirAlertRule, AirVariable, AlertRule, LocalIsoHour } from './types';

/*
 * Alertes sur l'air, les pollens et l'UV : un seuil choisi par l'utilisateur
 * sur la prevision CAMS Europe, sur les 72 prochaines heures. Toujours « au-
 * dessus de ». Il n'y a qu'une serie par grandeur (pas de cascade de modeles) :
 * la source est donc CAMS, nommee dans chaque phrase. Une valeur absente ne
 * declenche jamais rien.
 */

/** Ce que la prevision de qualite de l'air fournit, par heure ; structurel pour rester pur. */
export interface AirSeries {
  readonly timeline: readonly LocalIsoHour[];
  readonly europeanAqi: readonly (number | null)[];
  readonly pm2_5: readonly (number | null)[];
  readonly uvIndex: readonly (number | null)[];
  readonly pollen: Readonly<Record<string, readonly (number | null)[]>>;
}

export const AIR_VARIABLES: readonly AirVariable[] = ['uv', 'aqi', 'pm25', 'pollen'];

/** Seuil proposé à la creation d'une regle : le niveau a partir duquel on est concerne. */
export const AIR_DEFAULT_THRESHOLDS: Readonly<Record<AirVariable, number>> = {
  uv: 6,
  aqi: 60,
  pm25: 25,
  pollen: 80,
};

export function isAirRule(rule: AlertRule): rule is AirAlertRule {
  return rule.kind === 'air';
}

export interface AirCrossing {
  readonly time: LocalIsoHour;
  readonly value: number;
  /** Pollen en cause (celui qui culmine) pour la grandeur 'pollen', sinon null. */
  readonly pollen: string | null;
}

export interface AirHit {
  readonly rule: AirAlertRule;
  /** Premiere heure ou le seuil est depasse. */
  readonly first: AirCrossing;
  /** Valeur la plus haute sur l'horizon. */
  readonly extreme: AirCrossing;
  /** Nombre d'heures au-dessus du seuil. */
  readonly hours: number;
}

/**
 * Valeur d'une grandeur a un index de la timeline, ou null. Pour les pollens,
 * le plus fort de tous les pollens, avec son nom.
 */
export function airValueAt(
  air: AirSeries,
  index: number,
  variable: AirVariable,
): { readonly value: number; readonly pollen: string | null } | null {
  if (variable === 'pollen') {
    let best: { value: number; pollen: string } | null = null;
    for (const [kind, values] of Object.entries(air.pollen)) {
      const value = values[index] ?? null;
      if (value !== null && (best === null || value > best.value)) {
        best = { value, pollen: kind };
      }
    }
    return best;
  }
  const series = { uv: air.uvIndex, aqi: air.europeanAqi, pm25: air.pm2_5 }[variable];
  const value = series[index] ?? null;
  return value === null ? null : { value, pollen: null };
}

/**
 * Regles d'air actives de ce lieu depassees dans l'horizon d'alerte, dans
 * l'ordre des regles.
 */
export function evaluateAirAlerts(input: {
  readonly rules: readonly AlertRule[];
  readonly placeId: string;
  readonly air: AirSeries;
  readonly now: Date;
}): readonly AirHit[] {
  const { air } = input;
  const upcoming = air.timeline.flatMap((time, index) => {
    const lead = leadHoursFrom(input.now, time);
    return lead >= 0 && lead <= ALERT_HORIZON_HOURS ? [{ time, index }] : [];
  });
  return input.rules
    .filter(isAirRule)
    .filter((rule) => rule.enabled && rule.placeId === input.placeId)
    .flatMap((rule): AirHit[] => {
      const crossings = upcoming.flatMap(({ time, index }): AirCrossing[] => {
        const found = airValueAt(air, index, rule.variable);
        return found !== null && found.value > rule.threshold ? [{ time, ...found }] : [];
      });
      const [first] = crossings;
      if (first === undefined) {
        return [];
      }
      const extreme = crossings.reduce((best, c) => (c.value > best.value ? c : best), first);
      return [{ rule, first, extreme, hours: crossings.length }];
    });
}

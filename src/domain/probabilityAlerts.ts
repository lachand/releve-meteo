import { ALERT_HORIZON_HOURS, isWeatherRule } from './alerts';
import { leadHoursFrom } from './time';
import type { EnsembleHourly } from './ensemble';
import type { AlertRule, LocalIsoHour, WeatherAlertRule, WeatherVariable } from './types';

/*
 * Alerte en probabilite : « au moins 40 % de risque de gel ». Le seuil porte sur
 * la part des membres de l'ensemble qui franchissent une valeur, pas sur la
 * valeur du modele retenu : c'est la mesure d'incertitude que donne l'ensemble,
 * dite en pourcentage. Une part n'est pas un risque etalonne : c'est la
 * proportion de trajectoires plausibles, et l'ecran la nomme ainsi.
 */

/** Membres lus pour chaque grandeur : rafales pour le vent, comme les autres alertes. */
function membersOf(
  ensemble: EnsembleHourly,
  variable: WeatherVariable,
): readonly (readonly (number | null)[])[] {
  return variable === 'temperature'
    ? ensemble.temperature
    : variable === 'precipitation'
      ? ensemble.precipitation
      : ensemble.windGust;
}

function crosses(value: number, rule: Pick<WeatherAlertRule, 'comparator' | 'threshold'>): boolean {
  return rule.comparator === 'lt' ? value < rule.threshold : value > rule.threshold;
}

interface Count {
  readonly crossing: number;
  readonly known: number;
}

function countAt(
  values: readonly (number | null)[],
  rule: Pick<WeatherAlertRule, 'comparator' | 'threshold'>,
): Count {
  const known = values.filter((v): v is number => v !== null);
  return { crossing: known.filter((v) => crosses(v, rule)).length, known: known.length };
}

/**
 * Part des membres qui franchissent le seuil, [0, 1] ; null sans aucun membre
 * ayant une valeur (une valeur absente n'est jamais comptee comme non franchie).
 */
export function memberShare(
  values: readonly (number | null)[],
  comparator: WeatherAlertRule['comparator'],
  threshold: number,
): number | null {
  const { crossing, known } = countAt(values, { comparator, threshold });
  return known === 0 ? null : crossing / known;
}

export interface ProbabilityCrossing {
  readonly time: LocalIsoHour;
  /** Part des membres qui franchissent le seuil cette heure, [0, 1]. */
  readonly share: number;
}

export interface ProbabilityHit {
  readonly rule: WeatherAlertRule;
  /** Premiere heure ou la part atteint le pourcentage choisi. */
  readonly first: ProbabilityCrossing;
  /** Heure de la plus grande part sur l'horizon. */
  readonly peak: ProbabilityCrossing;
  /** Nombre d'heures ou la part atteint le pourcentage choisi. */
  readonly hours: number;
  /** Part des membres qui franchissent le seuil au moins une fois sur l'horizon, [0, 1]. */
  readonly anyTime: number;
  /** Membres ayant des valeurs. */
  readonly memberCount: number;
}

/** Regle d'ensemble active : de type probabilite, avec un pourcentage lisible. */
export function isProbabilityRule(
  rule: AlertRule,
): rule is WeatherAlertRule & { readonly probability: number } {
  return (
    isWeatherRule(rule) &&
    rule.kind === 'probability' &&
    typeof rule.probability === 'number' &&
    rule.probability > 0 &&
    rule.probability <= 100
  );
}

/**
 * Regles de probabilite actives de ce lieu, franchies dans l'horizon d'alerte,
 * dans l'ordre des regles. Evaluees sur les membres de l'ensemble, heure par
 * heure : l'heure compte quand la part des membres atteint le pourcentage.
 */
export function evaluateProbabilityAlerts(input: {
  readonly rules: readonly AlertRule[];
  readonly placeId: string;
  readonly ensemble: EnsembleHourly;
  readonly now: Date;
}): readonly ProbabilityHit[] {
  const { ensemble } = input;
  const upcoming = ensemble.timeline.flatMap((time, index) => {
    const lead = leadHoursFrom(input.now, time);
    return lead >= 0 && lead <= ALERT_HORIZON_HOURS ? [{ time, index }] : [];
  });
  return input.rules
    .filter(isProbabilityRule)
    .filter((rule) => rule.enabled && rule.placeId === input.placeId)
    .flatMap((rule): ProbabilityHit[] => {
      const members = membersOf(ensemble, rule.variable);
      const wanted = rule.probability;
      const hours = upcoming.flatMap(
        ({ time, index }): (ProbabilityCrossing & { atLeast: boolean })[] => {
          const { crossing, known } = countAt(
            members.map((member) => member[index] ?? null),
            rule,
          );
          // Comparaison en entiers : 4 membres sur 10 atteignent bien 40 %.
          return known === 0
            ? []
            : [{ time, share: crossing / known, atLeast: crossing * 100 >= wanted * known }];
        },
      );
      const reached = hours.filter((hour) => hour.atLeast);
      const [first] = reached;
      if (first === undefined) {
        return [];
      }
      const peak = reached.reduce((best, hour) => (hour.share > best.share ? hour : best), first);
      const memberCount = members.filter((member) => member.some((v) => v !== null)).length;
      const crossingMembers = members.filter((member) =>
        upcoming.some(({ index }) => {
          const value = member[index] ?? null;
          return value !== null && crosses(value, rule);
        }),
      ).length;
      return [
        {
          rule,
          first: { time: first.time, share: first.share },
          peak: { time: peak.time, share: peak.share },
          hours: reached.length,
          anyTime: crossingMembers / memberCount,
          memberCount,
        },
      ];
    });
}

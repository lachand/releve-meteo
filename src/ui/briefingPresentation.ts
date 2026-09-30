import type { Briefing } from '../domain/briefing';
import type { WeatherVariable } from '../domain/types';
import { formatOneDecimal, formatTemperature } from './format';
import { MODEL_LABELS } from './modelLabels';

/*
 * La phrase du bulletin. Le modele est toujours nomme, l'ecart des autres
 * toujours chiffre : la transparence sur la provenance, en une ligne.
 */

const CONFIDENCE_WORDS = { high: 'élevée', medium: 'moyenne', low: 'faible' } as const;

const VARIABLE_PHRASES: Readonly<Record<WeatherVariable, string>> = {
  temperature: 'la température',
  wind: 'le vent',
  precipitation: 'les précipitations',
};

function degrees(value: number): string {
  return `${formatOneDecimal(value)}\u00a0°C`;
}

function list(items: readonly string[]): string {
  return items.length > 1
    ? `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`
    : (items[0] ?? '');
}

export function briefingSentence(briefing: Briefing): string {
  const head = `${MODEL_LABELS[briefing.model]} prévoit ${formatTemperature(briefing.temperature)}\u00a0°C.`;
  if (briefing.others === 0 || briefing.meanGap === null || briefing.maxGap === null) {
    return `${head} Aucun autre modèle ne couvre cette heure\u00a0: pas de comparaison.`;
  }
  const spread =
    briefing.others === 1
      ? `L’autre modèle s’en écarte de ${degrees(briefing.meanGap)}`
      : `Les ${briefing.others} autres modèles s’en écartent de ${degrees(briefing.meanGap)} en moyenne, au plus ${degrees(briefing.maxGap)}`;
  if (briefing.confidence === 'unavailable') {
    return `${head} ${spread}.`;
  }
  const confidence = `confiance ${CONFIDENCE_WORDS[briefing.confidence]}`;
  const why =
    briefing.confidence !== 'high' && briefing.drivers.length > 0
      ? `, surtout sur ${list(briefing.drivers.map((variable) => VARIABLE_PHRASES[variable]))}`
      : '';
  return `${head} ${spread}\u00a0: ${confidence}${why}.`;
}

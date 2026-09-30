import type { PeriodBias } from '../domain/reliability';
import type { ModelId } from '../domain/types';
import { formatOneDecimal } from './format';
import { MODEL_LABELS } from './modelPresentation';

/** Ecart moyen, °C, a partir duquel un moment de la journee est dit trop chaud ou trop froid. */
export const NOTABLE_BIAS_C = 1;

/**
 * Le biais d'un modele par moment de la journee, en une phrase : ce qu'il
 * faut savoir de ses previsions de la veille ici, sans les retoucher.
 */
export function periodSentence(model: ModelId, periods: readonly PeriodBias[]): string {
  const lead = `${MODEL_LABELS[model]}, prévu la veille :`;
  const notable = periods.filter((p) => Math.abs(p.bias) >= NOTABLE_BIAS_C);
  if (notable.length === 0) {
    return `${lead} pas de biais marqué, quel que soit le moment de la journée.`;
  }
  const phrases = notable.map(
    (p) =>
      `${p.bias > 0 ? 'trop chaud' : 'trop froid'} ${p.period.label} (${formatOneDecimal(Math.abs(p.bias))}\u00a0°C en moyenne)`,
  );
  return `${lead} ${phrases.join(', ')}.`;
}

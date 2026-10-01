import type { Anomaly, DayNormal } from '../domain/normals';
import { NORMALS } from '../domain/normals';
import type { ModelId } from '../domain/types';
import { formatOneDecimal, formatTemperature } from './format';
import { MODEL_LABELS } from './modelLabels';

/** Ecart sous lequel on dit « proche de la normale », °C. */
export const NORMAL_CLOSE_C = 1;

const degrees = (value: number): string => `${formatOneDecimal(Math.abs(value))}\u00a0°C`;

/**
 * « AROME prévoit un maximum de 24 °C aujourd'hui, 3,4 °C au-dessus de la
 * normale 1991-2020 (21 °C) ». Le modele est nomme, la normale est dite
 * estimee. null quand le maximum prevu manque : on ne compare pas du vide.
 */
export function normalSentence(input: {
  readonly model: ModelId;
  readonly forecastMax: number | null;
  readonly normal: DayNormal;
  readonly anomaly: Anomaly;
}): string | null {
  const { model, forecastMax, normal, anomaly } = input;
  if (forecastMax === null || anomaly.max === null) {
    return null;
  }
  const lead = `${MODEL_LABELS[model]} prévoit un maximum de ${formatTemperature(forecastMax)}\u00a0°C aujourd’hui`;
  const reference = `la normale ${NORMALS.periodStart}-${NORMALS.periodEnd} (${formatTemperature(normal.tempMax)}\u00a0°C)`;
  if (Math.abs(anomaly.max) < NORMAL_CLOSE_C) {
    return `${lead}, proche de ${reference}.`;
  }
  return `${lead}, ${degrees(anomaly.max)} ${anomaly.max > 0 ? 'au-dessus' : 'au-dessous'} de ${reference}.`;
}

export const NORMALS_CAVEAT =
  'Normale : moyenne des maxima des jours voisins de la date, sur 30 ans, d’après la réanalyse ERA5. C’est une estimation sur une maille d’environ 30 km, pas une mesure de station.';

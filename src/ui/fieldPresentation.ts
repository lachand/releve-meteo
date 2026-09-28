import type { FillableField } from '../domain/modelCascade';
import type { ModelId } from '../domain/types';
import { MODEL_LABELS } from './modelPresentation';

export const FIELD_LABELS: Readonly<Record<FillableField, string>> = {
  precipitation: 'précipitations',
  windSpeed: 'vent',
  windGust: 'rafales',
  windDirection: 'direction du vent',
  pressure: 'pression',
  dewPoint: 'point de rosée',
  cloudCover: 'nébulosité',
  radiation: 'rayonnement',
  humidity: 'humidité',
  apparentTemperature: 'température ressentie',
  precipitationProbability: 'probabilité de pluie',
  snowfall: 'neige',
  cape: 'énergie convective',
  visibility: 'visibilité',
  freezingLevel: 'isotherme 0 °C',
  weatherCode: 'temps présent',
};

/** « nébulosité et pression : AROME France ; visibilité : GFS ». */
export function describeFilledFrom(
  filledFrom: Readonly<Partial<Record<FillableField, ModelId>>>,
): string | null {
  const byModel = new Map<ModelId, string[]>();
  for (const [field, model] of Object.entries(filledFrom) as [FillableField, ModelId][]) {
    const list = byModel.get(model) ?? [];
    list.push(FIELD_LABELS[field]);
    byModel.set(model, list);
  }
  if (byModel.size === 0) {
    return null;
  }
  return [...byModel.entries()]
    .map(([model, fields]) => {
      const joined =
        fields.length > 1
          ? `${fields.slice(0, -1).join(', ')} et ${fields.at(-1) ?? ''}`
          : (fields[0] ?? '');
      return `${joined} : ${MODEL_LABELS[model]}`;
    })
    .join(' ; ');
}

import type { ConfidenceVerdict } from './confidence';
import { MODEL_ORDER } from './models';
import type { ConfidenceLevel, ForecastBundle, ModelId, WeatherVariable } from './types';

/*
 * Bulletin en une phrase : ce que dit le modele retenu, et de combien les
 * autres modeles s'en ecartent a la meme heure. C'est la promesse du
 * produit resumee : jamais « il fera 14 °C », mais « AROME prevoit 14 °C,
 * les autres s'ecartent de 0,8 °C, confiance elevee ».
 */

export interface Briefing {
  readonly model: ModelId;
  readonly temperature: number;
  /** Autres modeles qui ont une temperature a cette heure. */
  readonly others: number;
  /** Ecart absolu moyen des autres au modele retenu, °C ; null sans autre modele. */
  readonly meanGap: number | null;
  /** Plus grand ecart absolu, °C ; null sans autre modele. */
  readonly maxGap: number | null;
  readonly confidence: ConfidenceLevel;
  /** Variables qui tirent la confiance vers le bas. */
  readonly drivers: readonly WeatherVariable[];
}

/**
 * Bulletin a l'index `index` de la timeline, ou null si le modele retenu
 * n'a pas de temperature a cette heure : rien n'est invente.
 */
export function briefingAt(input: {
  readonly bundle: ForecastBundle;
  readonly index: number;
  readonly active: { readonly model: ModelId; readonly temperature: number | null };
  readonly verdict: ConfidenceVerdict | null;
}): Briefing | null {
  const { active } = input;
  if (active.temperature === null) {
    return null;
  }
  const activeTemperature = active.temperature;
  const gaps = MODEL_ORDER.flatMap((model): number[] => {
    if (model === active.model) {
      return [];
    }
    const value = input.bundle.series[model]?.hourly[input.index]?.temperature.value ?? null;
    return value === null ? [] : [Math.abs(value - activeTemperature)];
  });
  return {
    model: active.model,
    temperature: activeTemperature,
    others: gaps.length,
    meanGap: gaps.length === 0 ? null : gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length,
    maxGap: gaps.length === 0 ? null : Math.max(...gaps),
    confidence: input.verdict?.level ?? 'unavailable',
    drivers: input.verdict?.drivers ?? [],
  };
}

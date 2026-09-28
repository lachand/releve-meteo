import type { AirQualitySeries, PollenKind } from '../data/clients/airQuality';

/** Indice europeen de qualite de l'air (EEA) : bornes superieures des classes. */
const AQI_CLASSES: readonly { readonly max: number; readonly label: string }[] = [
  { max: 20, label: 'Bon' },
  { max: 40, label: 'Correct' },
  { max: 60, label: 'Moyen' },
  { max: 80, label: 'Médiocre' },
  { max: 100, label: 'Très mauvais' },
  { max: Number.POSITIVE_INFINITY, label: 'Extrêmement mauvais' },
];

export function aqiLabel(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  return AQI_CLASSES.find((c) => value <= c.max)?.label ?? null;
}

export const POLLEN_LABELS: Readonly<Record<PollenKind, string>> = {
  alder: 'Aulne',
  birch: 'Bouleau',
  grass: 'Graminées',
  mugwort: 'Armoise',
  olive: 'Olivier',
  ragweed: 'Ambroisie',
};

/** Niveau de pollen, grains/m³ (seuils usuels du RNSA, simplifies). */
export function pollenLevel(value: number | null): 'nul' | 'faible' | 'moyen' | 'élevé' | null {
  if (value === null) {
    return null;
  }
  if (value < 1) {
    return 'nul';
  }
  if (value < 20) {
    return 'faible';
  }
  if (value < 80) {
    return 'moyen';
  }
  return 'élevé';
}

/** Index de l'heure courante dans la serie, ou -1. */
export function airQualityIndexAt(series: AirQualitySeries, hour: string): number {
  return series.timeline.indexOf(hour);
}

/** Maximum d'une serie sur une date, null si aucune valeur. */
export function dailyMax(
  series: AirQualitySeries,
  values: readonly (number | null)[],
  date: string,
): number | null {
  let max: number | null = null;
  for (const [index, time] of series.timeline.entries()) {
    const value = values[index] ?? null;
    if (time.startsWith(date) && value !== null) {
      max = max === null ? value : Math.max(max, value);
    }
  }
  return max;
}

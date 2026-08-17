import type { DailyPoint, ForecastBundle, ModelId } from '../domain/types';

const CASCADE_ORDER: readonly ModelId[] = ['arome', 'arpege', 'icon_eu', 'gfs'];

/**
 * Vue 7 jours : pas de cascade horaire a cette granularite (modelCascade.ts
 * raisonne en heures d'echeance), donc pour chaque jour on retient le
 * modele le plus fin qui couvre encore cette echeance, dans l'ordre
 * arome/arpege/icon_eu/gfs. Un jour hors de portee de tous les modeles
 * demandes est simplement absent du resultat.
 */
export function blendDaily(bundle: ForecastBundle): readonly DailyPoint[] {
  const byDate = new Map<string, DailyPoint>();
  for (const model of CASCADE_ORDER) {
    const series = bundle.series[model];
    if (series === undefined) {
      continue;
    }
    for (const day of series.daily) {
      if (!byDate.has(day.date) && day.tempMax.value !== null) {
        byDate.set(day.date, day);
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

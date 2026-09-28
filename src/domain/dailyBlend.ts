import { rankModels } from './modelSelection';
import type { SelectionContext } from './modelSelection';
import { leadHoursFrom, localIsoFromUtc } from './time';
import type { DailyPoint, ForecastBundle, ModelId } from './types';

/*
 * Synthese quotidienne (vue « jours ») : un modele par jour, choisi par le
 * meme score que la cascade horaire (echeance du midi local), parmi les
 * seuls modeles qui couvrent la journee entiere. Un modele qui s'arrete a
 * 14h donnerait un maximum sur une demi-journee : il est ecarte ce jour-la.
 */

export type BlendedDay = DailyPoint & { readonly model: ModelId };

/** Le modele a-t-il une temperature a chaque heure de cette date ? */
export function coversWholeDay(bundle: ForecastBundle, model: ModelId, date: string): boolean {
  const series = bundle.series[model];
  if (series === undefined) {
    return false;
  }
  let hours = 0;
  for (const [index, time] of bundle.timeline.entries()) {
    if (!time.startsWith(date)) {
      continue;
    }
    hours += 1;
    if (series.hourly[index]?.temperature.value == null) {
      return false;
    }
  }
  // 23 a 25 heures selon le changement d'heure ; une date tronquee en bout
  // de timeline n'est pas une journee entiere.
  return hours >= 23;
}

export function blendDaily(input: {
  readonly bundle: ForecastBundle;
  readonly context: SelectionContext;
  readonly now: Date;
  readonly preferred?: ModelId | null;
}): readonly BlendedDay[] {
  const { bundle, context, now } = input;
  const today = localIsoFromUtc(now.getTime()).slice(0, 10);
  const dates = new Set<string>();
  for (const series of Object.values(bundle.series)) {
    for (const day of series.daily) {
      if (day.date >= today) {
        dates.add(day.date);
      }
    }
  }

  const result: BlendedDay[] = [];
  for (const date of [...dates].sort()) {
    const lead = Math.max(0, leadHoursFrom(now, `${date}T12:00`));
    const candidates = rankModels(context, lead)
      .filter((r) => r.ineligibility !== 'unavailable' && r.ineligibility !== 'outOfDomain')
      .map((r) => r.model)
      .filter((model) => coversWholeDay(bundle, model, date));
    const preferred = input.preferred ?? null;
    const model = preferred !== null && candidates.includes(preferred) ? preferred : candidates[0];
    if (model === undefined) {
      continue;
    }
    const day = bundle.series[model]?.daily.find((d) => d.date === date);
    if (day !== undefined && day.tempMax.value !== null) {
      result.push({ ...day, model });
    }
  }
  return result;
}

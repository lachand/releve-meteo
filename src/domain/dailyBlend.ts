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

/** Champs quotidiens completes, faute de valeur chez le modele retenu. */
export const DAILY_FILLABLE = [
  'weatherCode',
  'uvIndexMax',
  'windGustMax',
  'windSpeedMax',
  'windDirectionDominant',
  'precipitationHours',
  'snowfallSum',
  'sunrise',
  'sunset',
] as const;

export type DailyFillable = (typeof DAILY_FILLABLE)[number];

export type BlendedDay = DailyPoint & {
  readonly model: ModelId;
  readonly filledFrom: Readonly<Partial<Record<DailyFillable, ModelId>>>;
};

function dailyValueMissing(day: DailyPoint, field: DailyFillable): boolean {
  switch (field) {
    case 'weatherCode':
    case 'sunrise':
    case 'sunset':
      return day[field] === null;
    default:
      return day[field].value === null;
  }
}

/**
 * Complete les champs absents du jour retenu par ceux des autres modeles,
 * dans l'ordre de preference donne ; chaque emprunt est nomme.
 */
function completeDay(
  bundle: ForecastBundle,
  day: DailyPoint,
  model: ModelId,
  donors: readonly ModelId[],
): BlendedDay {
  const completed: Record<string, unknown> = { ...day };
  const filledFrom: Partial<Record<DailyFillable, ModelId>> = {};
  for (const field of DAILY_FILLABLE) {
    if (!dailyValueMissing(day, field)) {
      continue;
    }
    for (const donor of donors) {
      const other =
        donor === model ? undefined : bundle.series[donor]?.daily.find((d) => d.date === day.date);
      if (other === undefined || dailyValueMissing(other, field)) {
        continue;
      }
      completed[field] = other[field];
      filledFrom[field] = donor;
      break;
    }
  }
  return { ...(completed as unknown as DailyPoint), model, filledFrom };
}

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
    const ranked = rankModels(context, lead)
      .filter((r) => r.ineligibility !== 'unavailable' && r.ineligibility !== 'outOfDomain')
      .map((r) => r.model);
    const candidates = ranked.filter((model) => coversWholeDay(bundle, model, date));
    const preferred = input.preferred ?? null;
    const model = preferred !== null && candidates.includes(preferred) ? preferred : candidates[0];
    if (model === undefined) {
      continue;
    }
    const day = bundle.series[model]?.daily.find((d) => d.date === date);
    if (day !== undefined && day.tempMax.value !== null) {
      // Donneurs : d'abord les modeles complets ce jour-la, puis les autres.
      const donors = [...candidates, ...ranked.filter((m) => !candidates.includes(m))];
      result.push(completeDay(bundle, day, model, donors));
    }
  }
  return result;
}

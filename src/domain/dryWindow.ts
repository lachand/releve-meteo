import type { AlertPoint } from './alerts';
import { localIsoFromUtc, utcMsFromLocalIso } from './time';
import type { LocalIsoHour, ModelId } from './types';

/*
 * Meilleur creneau pour sortir aujourd'hui : la plus longue suite d'heures
 * de jour, d'ici a ce soir, ou il ne pleut pas et ou les rafales restent
 * supportables. Une heure sans valeur de pluie ou de rafale n'est jamais
 * comptee comme seche : elle coupe la fenetre. Le modele qui fournit les
 * heures est nomme, comme partout ailleurs.
 */

export const DRY_WINDOW = {
  /** Au-dela, l'heure est mouillee, mm. */
  rainMm: 0.2,
  /** Au-dela, l'heure est trop ventee pour sortir, km/h. */
  gustKmh: 50,
  /** Une fenetre plus courte ne vaut pas d'etre annoncee, heures. */
  minHours: 2,
} as const;

export type DryWindow =
  | {
      readonly status: 'none';
      /** 'night' : plus d'heure de jour aujourd'hui ; 'wet-or-windy' : aucune fenetre assez longue. */
      readonly reason: 'night' | 'wet-or-windy';
    }
  | {
      /** Toutes les heures de jour qui restent sont utilisables. */
      readonly status: 'all-day' | 'window';
      readonly start: LocalIsoHour;
      /** Heure locale qui suit la derniere heure utilisable (borne exclue). */
      readonly end: LocalIsoHour;
      readonly hours: number;
      /** Modeles qui fournissent la pluie de ces heures, dans l'ordre. */
      readonly models: readonly ModelId[];
    };

function usable(point: AlertPoint): boolean {
  const rain = point.precipitation.value;
  const gust = point.windGust.value;
  return rain !== null && gust !== null && rain <= DRY_WINDOW.rainMm && gust <= DRY_WINDOW.gustKmh;
}

/** Heure locale qui suit, changement d'heure et minuit compris. */
function nextHour(time: LocalIsoHour): LocalIsoHour {
  return localIsoFromUtc(utcMsFromLocalIso(time) + 60 * 60 * 1000);
}

/**
 * Meilleur creneau sec de la fin de journee, ou `{ status: 'none' }` : rien
 * ne remplit DRY_WINDOW.minHours heures d'affilee. A duree egale, le plus
 * precoce.
 */
export function bestDryWindow(input: {
  readonly points: readonly AlertPoint[];
  readonly now: Date;
}): DryWindow {
  const nowIso = localIsoFromUtc(input.now.getTime());
  const today = nowIso.slice(0, 10);
  const currentHour = `${nowIso.slice(0, 13)}:00`;
  const daylight = input.points.filter(
    (point) =>
      point.time.slice(0, 10) === today && point.time >= currentHour && point.isDay === true,
  );

  const runs: AlertPoint[][] = [];
  let run: AlertPoint[] = [];
  for (const point of daylight) {
    const last = run.at(-1);
    if (usable(point) && last !== undefined && nextHour(last.time) === point.time) {
      run.push(point);
      continue;
    }
    if (run.length > 0) {
      runs.push(run);
    }
    run = usable(point) ? [point] : [];
  }
  if (run.length > 0) {
    runs.push(run);
  }

  const best = runs
    .filter((candidate) => candidate.length >= DRY_WINDOW.minHours)
    .reduce<AlertPoint[] | null>(
      (winner, candidate) =>
        winner === null || candidate.length > winner.length ? candidate : winner,
      null,
    );
  const first = best?.[0];
  const last = best?.at(-1);
  if (best === null || first === undefined || last === undefined) {
    return { status: 'none', reason: daylight.length === 0 ? 'night' : 'wet-or-windy' };
  }
  const models = best.reduce<ModelId[]>((list, point) => {
    const model = point.filledFrom?.precipitation ?? point.model;
    return list.includes(model) ? list : [...list, model];
  }, []);
  return {
    status: best.length === daylight.length ? 'all-day' : 'window',
    start: first.time,
    end: nextHour(last.time),
    hours: best.length,
    models,
  };
}

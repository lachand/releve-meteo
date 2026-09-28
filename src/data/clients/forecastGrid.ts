import type { ForecastGrid, GridPoint, GridSeries } from '../../domain/grid';
import type { LocalIsoHour, ModelId } from '../../domain/types';
import { request } from './http';
import type { HttpResult } from './http';
import { OPEN_METEO_MODEL_IDS } from './openMeteo';

/*
 * Carte de prevision : toute la grille en une requete Open-Meteo, les
 * coordonnees passees en listes paralleles (latitude[i], longitude[i]).
 * La reponse est alors un tableau, un objet par point, dans l'ordre.
 */

/** Echeances de la carte, heures. Au-dela, AROME ne couvre plus. */
export const GRID_HOURS = 48;

const VARIABLE_KEYS = {
  temperature: 'temperature_2m',
  precipitation: 'precipitation',
  windSpeed: 'wind_speed_10m',
  windDirection: 'wind_direction_10m',
} as const;

type GridVariable = keyof typeof VARIABLE_KEYS;

interface RawGridPoint {
  readonly hourly?: Readonly<Record<string, readonly (number | null)[] | readonly string[]>>;
}

export function buildForecastGridUrl(input: {
  readonly points: readonly GridPoint[];
  readonly model: ModelId;
  readonly hours?: number;
}): string {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', input.points.map((p) => p.latitude).join(','));
  url.searchParams.set('longitude', input.points.map((p) => p.longitude).join(','));
  url.searchParams.set('models', OPEN_METEO_MODEL_IDS[input.model]);
  url.searchParams.set('hourly', Object.values(VARIABLE_KEYS).join(','));
  url.searchParams.set('forecast_hours', String(input.hours ?? GRID_HOURS));
  url.searchParams.set('timezone', 'Europe/Paris');
  return url.toString();
}

function malformed(detail: string): HttpResult<ForecastGrid> {
  return { ok: false, failure: { kind: 'malformed', detail } };
}

/**
 * Reponse brute vers grille. Les instants sont ceux du premier point ;
 * chaque point est aligne sur eux par l'heure, jamais par position, et
 * une valeur absente reste null.
 */
export function mapForecastGrid(input: {
  readonly raw: unknown;
  readonly points: readonly GridPoint[];
  readonly model: ModelId;
  readonly stepKm: number;
}): HttpResult<ForecastGrid> {
  const { raw, points } = input;
  if (!Array.isArray(raw) || raw.length !== points.length) {
    return malformed('grille : un objet par point attendu');
  }
  const blocks = (raw as readonly RawGridPoint[]).map((item) => item.hourly);
  const times = blocks[0]?.time as readonly LocalIsoHour[] | undefined;
  if (times === undefined || times.length === 0) {
    return malformed('grille sans bloc horaire');
  }

  const series = (variable: GridVariable): GridSeries => {
    const columns = blocks.map((block) => {
      const blockTimes = block?.time as readonly LocalIsoHour[] | undefined;
      const values = block?.[VARIABLE_KEYS[variable]] as readonly (number | null)[] | undefined;
      const byTime = new Map<LocalIsoHour, number | null>();
      blockTimes?.forEach((time, index) => byTime.set(time, values?.[index] ?? null));
      return byTime;
    });
    return times.map((time) => columns.map((byTime) => byTime.get(time) ?? null));
  };

  return {
    ok: true,
    value: {
      model: input.model,
      provenance: 'forecast',
      points,
      stepKm: input.stepKm,
      times,
      temperature: series('temperature'),
      precipitation: series('precipitation'),
      windSpeed: series('windSpeed'),
      windDirection: series('windDirection'),
    },
  };
}

export async function fetchForecastGrid(input: {
  readonly points: readonly GridPoint[];
  readonly model: ModelId;
  readonly stepKm: number;
  readonly hours?: number;
}): Promise<HttpResult<ForecastGrid>> {
  const result = await request<unknown>(buildForecastGridUrl(input), { timeoutMs: 20000 });
  if (!result.ok) {
    return result;
  }
  return mapForecastGrid({
    raw: result.value,
    points: input.points,
    model: input.model,
    stepKm: input.stepKm,
  });
}

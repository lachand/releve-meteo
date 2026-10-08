import { OWN_READINGS } from '../../domain/ownReadings';
import type { PreviousDaySeries } from '../../domain/ownReadings';
import type { LocalIsoHour, ModelId } from '../../domain/types';
import { request } from './http';
import type { HttpResult } from './http';
import { OPEN_METEO_MODEL_IDS } from './openMeteo';
import type { RawForecastResponse } from './openMeteo';

/*
 * Prevision de la veille (Previous Runs API Open-Meteo, `_previous_day1`) pour
 * chaque modele, au point du lieu : ce que chaque modele annoncait vingt-quatre
 * heures avant, heure par heure, sur les 30 derniers jours. Sert a comparer vos
 * propres mesures (Mon relevé) aux previsions, jamais a une simulation rejouee.
 */

export function buildPreviousDayUrl(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation?: number | null;
  readonly models: readonly ModelId[];
}): string {
  const url = new URL('https://previous-runs-api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(input.latitude));
  url.searchParams.set('longitude', String(input.longitude));
  if (input.elevation !== undefined && input.elevation !== null) {
    url.searchParams.set('elevation', String(input.elevation));
  }
  url.searchParams.set('models', input.models.map((m) => OPEN_METEO_MODEL_IDS[m]).join(','));
  url.searchParams.set('hourly', 'temperature_2m_previous_day1,precipitation_previous_day1');
  url.searchParams.set('timezone', 'Europe/Paris');
  url.searchParams.set('past_days', String(OWN_READINGS.windowDays));
  url.searchParams.set('forecast_days', '1');
  return url.toString();
}

function seriesOf(
  hourly: NonNullable<RawForecastResponse['hourly']>,
  models: readonly ModelId[],
  variable: string,
  length: number,
): Partial<Record<ModelId, readonly (number | null)[]>> {
  const result: Partial<Record<ModelId, readonly (number | null)[]>> = {};
  for (const model of models) {
    // Une seule requete a un modele ne suffixe pas les variables.
    const key = models.length === 1 ? variable : `${variable}_${OPEN_METEO_MODEL_IDS[model]}`;
    const values = hourly[key] as readonly (number | null)[] | undefined;
    if (values !== undefined && values.some((value) => value !== null)) {
      result[model] = Array.from({ length }, (_, index) => values[index] ?? null);
    }
  }
  return result;
}

export function mapPreviousDay(
  raw: RawForecastResponse,
  models: readonly ModelId[],
): HttpResult<PreviousDaySeries> {
  const hourly = raw.hourly;
  const time = hourly?.time as readonly LocalIsoHour[] | undefined;
  if (hourly === undefined || time === undefined) {
    return {
      ok: false,
      failure: { kind: 'malformed', detail: 'previsions de la veille sans bloc horaire' },
    };
  }
  return {
    ok: true,
    value: {
      timeline: time,
      temperature: seriesOf(hourly, models, 'temperature_2m_previous_day1', time.length),
      precipitation: seriesOf(hourly, models, 'precipitation_previous_day1', time.length),
    },
  };
}

export async function fetchPreviousDay(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation?: number | null;
  readonly models: readonly ModelId[];
  readonly signal?: AbortSignal;
}): Promise<HttpResult<PreviousDaySeries>> {
  const result = await request<RawForecastResponse>(buildPreviousDayUrl(input), {
    signal: input.signal,
  });
  return result.ok ? mapPreviousDay(result.value, input.models) : result;
}

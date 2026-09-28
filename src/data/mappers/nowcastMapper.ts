import type { LocalIsoHour } from '../../domain/types';
import type { HttpResult } from '../clients/http';
import type { RawForecastResponse } from '../clients/openMeteo';

/** Precipitation AROME au pas de 15 min, mm par quart d'heure. */
export interface Nowcast {
  readonly times: readonly LocalIsoHour[];
  readonly precipitation: readonly (number | null)[];
}

export function mapNowcast(raw: RawForecastResponse): HttpResult<Nowcast> {
  const block = raw.minutely_15;
  const times = block?.time;
  const precipitation = block?.precipitation;
  if (block === undefined || times === undefined || precipitation === undefined) {
    return { ok: false, failure: { kind: 'malformed', detail: 'nowcast sans bloc minutely_15' } };
  }
  if (times.length !== precipitation.length) {
    return {
      ok: false,
      failure: { kind: 'malformed', detail: 'nowcast de longueurs incoherentes' },
    };
  }
  return {
    ok: true,
    value: {
      times: times as readonly LocalIsoHour[],
      precipitation: precipitation as readonly (number | null)[],
    },
  };
}

import { describe, expect, it } from 'vitest';
import type { RawForecastResponse } from '../clients/openMeteo';
import { mapNowcast } from './nowcastMapper';

function response(minutely15?: RawForecastResponse['minutely_15']): RawForecastResponse {
  return {
    latitude: 45.49,
    longitude: 5.47,
    elevation: 468,
    timezone: 'Europe/Paris',
    utc_offset_seconds: 7200,
    minutely_15: minutely15,
  };
}

describe('mapNowcast', () => {
  it('retourne les temps et precipitations quand le bloc minutely_15 est present', () => {
    const result = mapNowcast(
      response({
        time: ['2026-09-28T14:15', '2026-09-28T14:30', '2026-09-28T14:45'],
        precipitation: [0, 0.2, 0.4],
      }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        times: ['2026-09-28T14:15', '2026-09-28T14:30', '2026-09-28T14:45'],
        precipitation: [0, 0.2, 0.4],
      },
    });
  });

  it('conserve les null de precipitation, jamais convertis en 0', () => {
    const result = mapNowcast(
      response({
        time: ['2026-09-28T14:15', '2026-09-28T14:30'],
        precipitation: [null, 0.1],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.precipitation[0]).toBeNull();
  });

  it('echoue en malformed si le bloc minutely_15 est absent', () => {
    const result = mapNowcast(response(undefined));
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'malformed', detail: 'nowcast sans bloc minutely_15' },
    });
  });

  it('echoue en malformed si time est absent du bloc', () => {
    const result = mapNowcast(response({ precipitation: [0] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('malformed');
  });

  it('echoue en malformed si precipitation est absent du bloc', () => {
    const result = mapNowcast(response({ time: ['2026-09-28T14:15'] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('malformed');
  });

  it('echoue en malformed sur des longueurs incoherentes', () => {
    const result = mapNowcast(
      response({
        time: ['2026-09-28T14:15', '2026-09-28T14:30'],
        precipitation: [0],
      }),
    );
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'malformed', detail: 'nowcast de longueurs incoherentes' },
    });
  });
});

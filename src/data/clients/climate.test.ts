import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import { buildClimateUrl, fetchClimate, mapClimate } from './climate';

describe('buildClimateUrl', () => {
  it('demande les maxima et minima de 1991 a 2020, a l altitude du lieu', () => {
    const url = new URL(buildClimateUrl({ latitude: 45.7578, longitude: 4.832, elevation: 169.6 }));
    expect(url.origin + url.pathname).toBe('https://archive-api.open-meteo.com/v1/archive');
    expect(url.searchParams.get('start_date')).toBe('1991-01-01');
    expect(url.searchParams.get('end_date')).toBe('2020-12-31');
    expect(url.searchParams.get('daily')).toBe('temperature_2m_max,temperature_2m_min');
    expect(url.searchParams.get('elevation')).toBe('170');
  });
});

describe('mapClimate', () => {
  it('garde les series alignees, valeurs absentes comprises', () => {
    const result = mapClimate({
      daily: {
        time: ['1991-01-01', '1991-01-02'],
        temperature_2m_max: [5, null],
        temperature_2m_min: [1, 0],
      },
    });
    expect(result).toEqual({
      ok: true,
      value: { dates: ['1991-01-01', '1991-01-02'], tempMax: [5, null], tempMin: [1, 0] },
    });
  });

  it('refuse une reponse sans serie, ou dont les series ne s alignent pas', () => {
    expect(mapClimate({})).toMatchObject({ ok: false, failure: { kind: 'malformed' } });
    expect(
      mapClimate({
        daily: { time: ['1991-01-01'], temperature_2m_max: [1, 2], temperature_2m_min: [1] },
      }),
    ).toMatchObject({ ok: false });
  });
});

describe('fetchClimate', () => {
  it('lit la reponse du service, et propage son echec', async () => {
    server.use(
      http.get('https://archive-api.open-meteo.com/v1/archive', () =>
        HttpResponse.json({
          daily: { time: ['1991-01-01'], temperature_2m_max: [3], temperature_2m_min: [-1] },
        }),
      ),
    );
    const ok = await fetchClimate({ latitude: 45, longitude: 5, elevation: 100 });
    expect(ok.ok && ok.value.tempMax).toEqual([3]);
    server.use(
      http.get('https://archive-api.open-meteo.com/v1/archive', () => HttpResponse.error()),
    );
    expect((await fetchClimate({ latitude: 45, longitude: 5, elevation: 100 })).ok).toBe(false);
  });
});

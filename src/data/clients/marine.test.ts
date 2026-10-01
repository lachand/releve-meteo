import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import { buildMarineUrl, fetchMarine, mapMarine } from './marine';

describe('marine', () => {
  it('demande hauteur, periode et direction des vagues sur trois jours', () => {
    const url = new URL(buildMarineUrl(48.39, -4.49));
    expect(url.origin + url.pathname).toBe('https://marine-api.open-meteo.com/v1/marine');
    expect(url.searchParams.get('hourly')).toBe('wave_height,wave_period,wave_direction');
    expect(url.searchParams.get('forecast_days')).toBe('3');
  });

  it('garde les series, et accepte l absence de periode ou de direction', () => {
    const time = ['2026-09-28T10:00'];
    expect(mapMarine({ hourly: { time, wave_height: [1.2] } })).toEqual({
      ok: true,
      value: { timeline: time, waveHeight: [1.2], wavePeriod: [], waveDirection: [] },
    });
    expect(
      mapMarine({
        hourly: { time, wave_height: [1.2], wave_period: [8], wave_direction: [270] },
      }),
    ).toMatchObject({ ok: true, value: { wavePeriod: [8], waveDirection: [270] } });
  });

  it('refuse une reponse sans vagues', () => {
    expect(mapMarine({})).toMatchObject({ ok: false, failure: { kind: 'malformed' } });
    expect(mapMarine({ hourly: { time: ['2026-09-28T10:00'] } })).toMatchObject({ ok: false });
  });

  it('lit la reponse du service, et propage son echec', async () => {
    server.use(
      http.get('https://marine-api.open-meteo.com/v1/marine', () =>
        HttpResponse.json({ hourly: { time: ['2026-09-28T10:00'], wave_height: [0.9] } }),
      ),
    );
    const ok = await fetchMarine(48.39, -4.49);
    expect(ok.ok && ok.value.waveHeight).toEqual([0.9]);
    server.use(http.get('https://marine-api.open-meteo.com/v1/marine', () => HttpResponse.error()));
    expect((await fetchMarine(48.39, -4.49)).ok).toBe(false);
  });
});

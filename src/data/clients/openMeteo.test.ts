import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import { buildForecastUrl, fetchForecast, OPEN_METEO_MODEL_IDS } from './openMeteo';

describe('OPEN_METEO_MODEL_IDS', () => {
  it("correspond aux identifiants verifies contre l'API reelle", () => {
    expect(OPEN_METEO_MODEL_IDS).toEqual({
      arome: 'meteofrance_arome_france_hd',
      arpege: 'meteofrance_arpege_europe',
      icon_eu: 'icon_eu',
      gfs: 'gfs_seamless',
    });
  });
});

describe('buildForecastUrl', () => {
  it('construit une URL avec les quatre modeles, les variables et le fuseau Paris', () => {
    const url = new URL(
      buildForecastUrl({
        latitude: 45.4936,
        longitude: 5.4708,
        models: ['arome', 'arpege', 'icon_eu', 'gfs'],
      }),
    );
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe('45.4936');
    expect(url.searchParams.get('longitude')).toBe('5.4708');
    expect(url.searchParams.get('models')).toBe(
      'meteofrance_arome_france_hd,meteofrance_arpege_europe,icon_eu,gfs_seamless',
    );
    expect(url.searchParams.get('hourly')).toContain('temperature_2m');
    expect(url.searchParams.get('hourly')).toContain('precipitation');
    expect(url.searchParams.get('daily')).toContain('sunrise');
    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
    expect(url.searchParams.get('past_days')).toBe('0');
    expect(url.searchParams.get('forecast_days')).toBe('7');
  });

  it('reprend pastDays et forecastDays quand fournis', () => {
    const url = new URL(
      buildForecastUrl({
        latitude: 45.4936,
        longitude: 5.4708,
        models: ['arome'],
        pastDays: 3,
        forecastDays: 14,
      }),
    );
    expect(url.searchParams.get('past_days')).toBe('3');
    expect(url.searchParams.get('forecast_days')).toBe('14');
  });

  it("ne construit une URL qu'avec les modeles demandes", () => {
    const url = new URL(buildForecastUrl({ latitude: 0, longitude: 0, models: ['gfs'] }));
    expect(url.searchParams.get('models')).toBe('gfs_seamless');
  });
});

describe('fetchForecast', () => {
  it('retourne ok:true avec le payload sur succes', async () => {
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({
          latitude: 45.49,
          longitude: 5.47,
          elevation: 468,
          timezone: 'Europe/Paris',
          utc_offset_seconds: 7200,
          hourly: { time: ['2026-08-17T00:00'] },
        }),
      ),
    );
    const result = await fetchForecast({ latitude: 45.4936, longitude: 5.4708, models: ['arome'] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timezone).toBe('Europe/Paris');
    }
  });

  it("propage un HttpResult d'echec sans exception", async () => {
    server.use(
      http.get(
        'https://api.open-meteo.com/v1/forecast',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const result = await fetchForecast({ latitude: 45.4936, longitude: 5.4708, models: ['arome'] });
    expect(result.ok).toBe(false);
  });
});

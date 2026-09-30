import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import {
  buildForecastUrl,
  buildNowcastUrl,
  buildStationPointUrl,
  buildStationPreviousDayUrl,
  fetchForecast,
  fetchNowcast,
  fetchStationPoint,
  fetchStationPreviousDay,
  mapStationPoint,
  mapStationPreviousDay,
  OPEN_METEO_MODEL_IDS,
  STATION_POINT_FORECAST_HOURS,
  STATION_POINT_PAST_HOURS,
} from './openMeteo';

describe('OPEN_METEO_MODEL_IDS', () => {
  it("correspond aux identifiants verifies contre l'API reelle", () => {
    expect(OPEN_METEO_MODEL_IDS).toEqual({
      arome: 'meteofrance_arome_france_hd',
      arome_france: 'meteofrance_arome_france',
      icon_d2: 'icon_d2',
      arpege: 'meteofrance_arpege_europe',
      icon_eu: 'icon_eu',
      ecmwf: 'ecmwf_ifs025',
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

describe('buildNowcastUrl', () => {
  it('construit une URL AROME minutely_15 avec la fenetre passee/future', () => {
    const url = new URL(buildNowcastUrl(45.4936, 5.4708));
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe('45.4936');
    expect(url.searchParams.get('longitude')).toBe('5.4708');
    expect(url.searchParams.get('models')).toBe('meteofrance_arome_france_hd');
    expect(url.searchParams.get('minutely_15')).toBe('precipitation');
    expect(url.searchParams.get('forecast_minutely_15')).toBe('12');
    expect(url.searchParams.get('past_minutely_15')).toBe('4');
    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
  });
});

describe('fetchNowcast', () => {
  it('retourne ok:true avec le bloc minutely_15 sur succes', async () => {
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({
          latitude: 45.49,
          longitude: 5.47,
          elevation: 468,
          timezone: 'Europe/Paris',
          utc_offset_seconds: 7200,
          minutely_15: {
            time: ['2026-09-28T14:15', '2026-09-28T14:30'],
            precipitation: [0, 0.1],
          },
        }),
      ),
    );
    const result = await fetchNowcast(45.4936, 5.4708);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.minutely_15?.precipitation).toEqual([0, 0.1]);
    }
  });

  it("propage un HttpResult d'echec sans exception", async () => {
    server.use(
      http.get(
        'https://api.open-meteo.com/v1/forecast',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const result = await fetchNowcast(45.4936, 5.4708);
    expect(result.ok).toBe(false);
  });
});

describe('buildStationPointUrl', () => {
  it("interroge les modeles au point et a l'altitude de la station, sur les heures passees", () => {
    const url = new URL(
      buildStationPointUrl({
        latitude: 45.7167,
        longitude: 4.95,
        elevation: 200,
        models: ['arome', 'ecmwf'],
      }),
    );
    expect(url.searchParams.get('latitude')).toBe('45.7167');
    expect(url.searchParams.get('longitude')).toBe('4.95');
    expect(url.searchParams.get('elevation')).toBe('200');
    expect(url.searchParams.get('models')).toBe('meteofrance_arome_france_hd,ecmwf_ifs025');
    expect(url.searchParams.get('hourly')).toBe('temperature_2m');
    expect(url.searchParams.get('past_hours')).toBe(String(STATION_POINT_PAST_HOURS));
    // L'heure courante et les 12 suivantes : de quoi enregistrer un instantane.
    expect(url.searchParams.get('forecast_hours')).toBe(String(STATION_POINT_FORECAST_HOURS));
    expect(STATION_POINT_FORECAST_HOURS).toBe(13);
  });

  it("laisse Open-Meteo choisir l'altitude quand celle de la station est inconnue", () => {
    const url = new URL(
      buildStationPointUrl({ latitude: 45, longitude: 5, elevation: null, models: ['arome'] }),
    );
    expect(url.searchParams.has('elevation')).toBe(false);
  });
});

describe('mapStationPoint', () => {
  const time = ['2026-09-28T11:00', '2026-09-28T12:00'];

  it('lit les cles suffixees quand plusieurs modeles sont demandes, et omet un modele vide', () => {
    const result = mapStationPoint(
      {
        latitude: 45.7,
        longitude: 4.9,
        elevation: 200,
        timezone: 'Europe/Paris',
        utc_offset_seconds: 7200,
        hourly: {
          time,
          temperature_2m_meteofrance_arome_france_hd: [24.1, null],
          temperature_2m_ecmwf_ifs025: [null, null],
        },
      },
      ['arome', 'ecmwf', 'gfs'],
    );
    expect(result).toEqual({
      ok: true,
      value: { timeline: time, temperature: { arome: [24.1, null] } },
    });
  });

  it('lit la cle nue pour un seul modele', () => {
    const result = mapStationPoint(
      {
        latitude: 45.7,
        longitude: 4.9,
        elevation: 200,
        timezone: 'Europe/Paris',
        utc_offset_seconds: 7200,
        hourly: { time, temperature_2m: [23, 24] },
      },
      ['icon_d2'],
    );
    expect(result.ok && result.value.temperature.icon_d2).toEqual([23, 24]);
  });

  it('refuse une reponse sans bloc horaire', () => {
    const result = mapStationPoint(
      { latitude: 0, longitude: 0, elevation: 0, timezone: 'UTC', utc_offset_seconds: 0 },
      ['arome'],
    );
    expect(result.ok).toBe(false);
  });
});

describe('fetchStationPoint', () => {
  it('rend les series par modele, ou propage un echec', async () => {
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({ hourly: { time: ['2026-09-28T12:00'], temperature_2m: [25] } }),
      ),
    );
    const ok = await fetchStationPoint({
      latitude: 45,
      longitude: 5,
      elevation: 300,
      models: ['arome'],
    });
    expect(ok.ok && ok.value.temperature.arome).toEqual([25]);

    server.use(
      http.get(
        'https://api.open-meteo.com/v1/forecast',
        () => new HttpResponse(null, { status: 400 }),
      ),
    );
    const failed = await fetchStationPoint({
      latitude: 45,
      longitude: 5,
      elevation: 300,
      models: ['arome'],
    });
    expect(failed.ok).toBe(false);
  });
});

describe('buildStationPreviousDayUrl', () => {
  it('demande la temperature prevue la veille au point de la station, sur deux jours passes', () => {
    const url = new URL(
      buildStationPreviousDayUrl({
        latitude: 45.7167,
        longitude: 4.95,
        elevation: 200,
        models: ['arome', 'ecmwf'],
      }),
    );
    expect(url.origin).toBe('https://previous-runs-api.open-meteo.com');
    expect(url.searchParams.get('elevation')).toBe('200');
    expect(url.searchParams.get('models')).toBe('meteofrance_arome_france_hd,ecmwf_ifs025');
    expect(url.searchParams.get('hourly')).toBe('temperature_2m_previous_day1');
    expect(url.searchParams.get('past_days')).toBe('2');
    expect(url.searchParams.get('forecast_days')).toBe('1');
    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
  });

  it("laisse Open-Meteo choisir l'altitude quand celle de la station est inconnue", () => {
    const url = new URL(
      buildStationPreviousDayUrl({
        latitude: 45,
        longitude: 5,
        elevation: null,
        models: ['arome'],
      }),
    );
    expect(url.searchParams.has('elevation')).toBe(false);
  });
});

describe('mapStationPreviousDay', () => {
  const time = ['2026-09-27T11:00', '2026-09-27T12:00'];
  const base = {
    latitude: 45.7,
    longitude: 4.9,
    elevation: 200,
    timezone: 'Europe/Paris',
    utc_offset_seconds: 7200,
  };

  it('lit les cles suffixees par modele et omet un modele vide', () => {
    const result = mapStationPreviousDay(
      {
        ...base,
        hourly: {
          time,
          temperature_2m_previous_day1_meteofrance_arome_france_hd: [24.1, null],
          temperature_2m_previous_day1_ecmwf_ifs025: [null, null],
        },
      },
      ['arome', 'ecmwf'],
    );
    expect(result).toEqual({
      ok: true,
      value: { timeline: time, temperature: { arome: [24.1, null] } },
    });
  });

  it('lit la cle nue pour un seul modele', () => {
    const result = mapStationPreviousDay(
      { ...base, hourly: { time, temperature_2m_previous_day1: [23, 24] } },
      ['arome'],
    );
    expect(result.ok && result.value.temperature.arome).toEqual([23, 24]);
  });
});

describe('fetchStationPreviousDay', () => {
  it('rend les series par modele, ou propage un echec', async () => {
    server.use(
      http.get('https://previous-runs-api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({
          hourly: { time: ['2026-09-27T12:00'], temperature_2m_previous_day1: [25] },
        }),
      ),
    );
    const input = { latitude: 45, longitude: 5, elevation: 300, models: ['arome' as const] };
    const ok = await fetchStationPreviousDay(input);
    expect(ok.ok && ok.value.temperature.arome).toEqual([25]);

    server.use(
      http.get(
        'https://previous-runs-api.open-meteo.com/v1/forecast',
        () => new HttpResponse(null, { status: 400 }),
      ),
    );
    expect((await fetchStationPreviousDay(input)).ok).toBe(false);
  });
});

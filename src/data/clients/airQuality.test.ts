import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import { buildAirQualityUrl, fetchAirQuality, mapAirQuality } from './airQuality';

describe('buildAirQualityUrl', () => {
  it('construit une URL avec les variables de base et les six pollens', () => {
    const url = new URL(buildAirQualityUrl(45.4936, 5.4708));
    expect(url.origin + url.pathname).toBe('https://air-quality-api.open-meteo.com/v1/air-quality');
    expect(url.searchParams.get('latitude')).toBe('45.4936');
    expect(url.searchParams.get('longitude')).toBe('5.4708');
    const hourly = url.searchParams.get('hourly') ?? '';
    for (const key of [
      'european_aqi',
      'pm2_5',
      'pm10',
      'ozone',
      'nitrogen_dioxide',
      'uv_index',
      'alder_pollen',
      'birch_pollen',
      'grass_pollen',
      'mugwort_pollen',
      'olive_pollen',
      'ragweed_pollen',
    ]) {
      expect(hourly).toContain(key);
    }
    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
    expect(url.searchParams.get('forecast_days')).toBe('4');
  });
});

describe('mapAirQuality', () => {
  it('echoue en malformed si le bloc horaire est absent', () => {
    const result = mapAirQuality({});
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'malformed', detail: "qualite de l'air sans bloc horaire" },
    });
  });

  it('echoue en malformed si time est absent du bloc', () => {
    const result = mapAirQuality({ hourly: { pm10: [1] } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('malformed');
  });

  it('mappe toutes les variables et les six pollens sur un payload complet', () => {
    const result = mapAirQuality({
      hourly: {
        time: ['2026-09-28T00:00', '2026-09-28T01:00'],
        european_aqi: [20, 22],
        pm2_5: [5, 6],
        pm10: [10, 11],
        ozone: [50, 52],
        nitrogen_dioxide: [15, 16],
        uv_index: [0, 1],
        alder_pollen: [0, 0],
        birch_pollen: [0, 0],
        grass_pollen: [10, 12],
        mugwort_pollen: [0, 0],
        olive_pollen: [0, 0],
        ragweed_pollen: [0, 0],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.timeline).toEqual(['2026-09-28T00:00', '2026-09-28T01:00']);
    expect(result.value.europeanAqi).toEqual([20, 22]);
    expect(result.value.pollen.grass).toEqual([10, 12]);
  });

  it('remplace par des null quand une cle est absente, jamais par 0', () => {
    const result = mapAirQuality({
      hourly: {
        time: ['2026-09-28T00:00'],
        pm10: [10],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pm2_5).toEqual([null]);
    expect(result.value.pollen.birch).toEqual([null]);
    expect(result.value.pm10).toEqual([10]);
  });

  it('remplace par des null une serie de longueur incoherente', () => {
    const result = mapAirQuality({
      hourly: {
        time: ['2026-09-28T00:00', '2026-09-28T01:00'],
        pm10: [10], // tronquee
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pm10).toEqual([null, null]);
  });
});

describe('fetchAirQuality', () => {
  it('retourne AirQualitySeries mappe sur succes', async () => {
    server.use(
      http.get('https://air-quality-api.open-meteo.com/v1/air-quality', () =>
        HttpResponse.json({
          hourly: { time: ['2026-09-28T00:00'], european_aqi: [18] },
        }),
      ),
    );
    const result = await fetchAirQuality(45.4936, 5.4708);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.europeanAqi).toEqual([18]);
    }
  });

  it("propage l'echec HTTP sans exception", async () => {
    server.use(
      http.get(
        'https://air-quality-api.open-meteo.com/v1/air-quality',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const result = await fetchAirQuality(45.4936, 5.4708);
    expect(result.ok).toBe(false);
  });
});

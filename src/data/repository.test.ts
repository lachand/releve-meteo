import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../tests/msw';
import { deleteDbForTests } from './cache/db';
import { resetMemoryForecastStore, setCachedForecast } from './cache/forecastStore';
import { resetMemoryGeocodingStore } from './cache/geocodingStore';
import { getForecast, searchPlaces } from './repository';
import type { ForecastBundle, Place } from '../domain/types';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

function forecastPayload(temperature: number) {
  return {
    latitude: 45.49,
    longitude: 5.47,
    elevation: 468,
    timezone: 'Europe/Paris',
    utc_offset_seconds: 7200,
    hourly: {
      time: ['2026-08-17T00:00'],
      temperature_2m: [temperature],
      precipitation: [0],
      wind_speed_10m: [5],
      wind_gusts_10m: [10],
      wind_direction_10m: [180],
      pressure_msl: [1013],
      dew_point_2m: [8],
      cloud_cover: [50],
      shortwave_radiation: [0],
      weather_code: [1],
    },
  };
}

beforeEach(async () => {
  await deleteDbForTests();
  resetMemoryForecastStore();
  resetMemoryGeocodingStore();
});

describe('getForecast', () => {
  it('zero requete reseau au deuxieme appel dans le TTL', async () => {
    let calls = 0;
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () => {
        calls += 1;
        return HttpResponse.json(forecastPayload(14));
      }),
    );
    await getForecast({ place, models: ['arome'] });
    await getForecast({ place, models: ['arome'] });
    expect(calls).toBe(1);
  });

  it('une requete apres expiration du cache', async () => {
    const staleBundle: ForecastBundle = {
      place,
      fetchedAt: 0,
      timeline: ['2026-08-17T00:00'],
      series: {},
    };
    await setCachedForecast(
      { placeId: place.id, models: ['arome'], pastDays: 0, forecastDays: 7 },
      staleBundle,
      0,
      1, // expiresAt tres ancien : deja expire
    );
    let calls = 0;
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () => {
        calls += 1;
        return HttpResponse.json(forecastPayload(16));
      }),
    );
    const result = await getForecast({ place, models: ['arome'] });
    expect(calls).toBe(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fromCache).toBe(false);
      expect(result.value.stale).toBe(false);
    }
  });

  it('force une requete meme si le cache est valide quand forceRefresh est demande', async () => {
    let calls = 0;
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () => {
        calls += 1;
        return HttpResponse.json(forecastPayload(14));
      }),
    );
    await getForecast({ place, models: ['arome'] });
    await getForecast({ place, models: ['arome'], forceRefresh: true });
    expect(calls).toBe(2);
  });

  it('deduplique deux appels concurrents sur la meme cle en une seule requete', async () => {
    let calls = 0;
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () => {
        calls += 1;
        return HttpResponse.json(forecastPayload(14));
      }),
    );
    const [first, second] = await Promise.all([
      getForecast({ place, models: ['arome'] }),
      getForecast({ place, models: ['arome'] }),
    ]);
    expect(calls).toBe(1);
    expect(first).toEqual(second);
  });

  it('sert le cache expire avec stale:true quand le reseau echoue', async () => {
    const staleBundle: ForecastBundle = {
      place,
      fetchedAt: 0,
      timeline: ['2026-08-17T00:00'],
      series: {},
    };
    await setCachedForecast(
      { placeId: place.id, models: ['arome'], pastDays: 0, forecastDays: 7 },
      staleBundle,
      0,
      1,
    );
    server.use(http.get('https://api.open-meteo.com/v1/forecast', () => HttpResponse.error()));
    const result = await getForecast({ place, models: ['arome'] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stale).toBe(true);
      expect(result.value.fromCache).toBe(true);
      expect(result.value.bundle).toEqual(staleBundle);
    }
  });

  it("retourne un HttpResult d'echec hors ligne sans cache", async () => {
    server.use(http.get('https://api.open-meteo.com/v1/forecast', () => HttpResponse.error()));
    const result = await getForecast({ place, models: ['arome'] });
    expect(result.ok).toBe(false);
  });

  it('propage un echec malformed du mapper sans le masquer', async () => {
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({ latitude: 45.49, longitude: 5.47 }),
      ),
    );
    const result = await getForecast({ place, models: ['arome'] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('malformed');
    }
  });
});

describe('searchPlaces', () => {
  it('propage les resultats de recherche', async () => {
    server.use(
      http.get('https://geocoding-api.open-meteo.com/v1/search', () =>
        HttpResponse.json({
          results: [{ latitude: 45.49, longitude: 5.47, name: 'Virieu', elevation: 415 }],
        }),
      ),
    );
    const result = await searchPlaces('Virieu');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.name).toBe('Virieu');
    }
  });

  it('zero requete reseau au deuxieme appel dans le TTL', async () => {
    let calls = 0;
    server.use(
      http.get('https://geocoding-api.open-meteo.com/v1/search', () => {
        calls += 1;
        return HttpResponse.json({ results: [] });
      }),
    );
    await searchPlaces('Virieu');
    await searchPlaces('virieu'); // meme requete normalisee
    expect(calls).toBe(1);
  });
});

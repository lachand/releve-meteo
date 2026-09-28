import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../tests/msw';
import { deleteDbForTests } from './cache/db';
import { resetMemoryDatasetStore, setDataset } from './cache/datasetStore';
import { resetMemoryForecastStore, setCachedForecast } from './cache/forecastStore';
import { resetMemoryGeocodingStore } from './cache/geocodingStore';
import {
  FORECAST_DAYS,
  getAirQuality,
  getEnsemble,
  getForecast,
  getNowcast,
  getVerifications,
  loadStations,
  PAST_DAYS,
  resetStationsForTests,
  searchPlaces,
} from './repository';
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
  resetMemoryDatasetStore();
  resetStationsForTests();
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
      { placeId: place.id, models: ['arome'], pastDays: PAST_DAYS, forecastDays: FORECAST_DAYS },
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
      { placeId: place.id, models: ['arome'], pastDays: PAST_DAYS, forecastDays: FORECAST_DAYS },
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

describe('getAirQuality (throughCache : frais / reseau / perime / echec)', () => {
  const AQ_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

  it('effectue une requete reseau quand rien n est en cache et memorise le resultat', async () => {
    let calls = 0;
    server.use(
      http.get(AQ_URL, () => {
        calls += 1;
        return HttpResponse.json({ hourly: { time: ['2026-09-28T00:00'], european_aqi: [10] } });
      }),
    );
    const result = await getAirQuality(place);
    expect(calls).toBe(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stale).toBe(false);
      expect(result.value.value.europeanAqi).toEqual([10]);
    }
  });

  it('zero requete reseau au deuxieme appel dans le TTL (frais depuis le cache)', async () => {
    let calls = 0;
    server.use(
      http.get(AQ_URL, () => {
        calls += 1;
        return HttpResponse.json({ hourly: { time: ['2026-09-28T00:00'], european_aqi: [10] } });
      }),
    );
    await getAirQuality(place);
    const second = await getAirQuality(place);
    expect(calls).toBe(1);
    if (second.ok) {
      expect(second.value.stale).toBe(false);
    }
  });

  it('sert la copie perimee avec stale:true quand le reseau echoue', async () => {
    await setDataset('airQuality', place.id, { europeanAqi: [1] }, 0, 1); // deja expire
    server.use(http.get(AQ_URL, () => HttpResponse.error()));
    const result = await getAirQuality(place);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stale).toBe(true);
      expect(result.value.value.europeanAqi).toEqual([1]);
    }
  });

  it("retourne un HttpResult d'echec quand le reseau echoue sans rien en cache", async () => {
    server.use(http.get(AQ_URL, () => HttpResponse.error()));
    const result = await getAirQuality(place);
    expect(result.ok).toBe(false);
  });
});

describe('getEnsemble', () => {
  it('recupere les membres ECMWF ENS et les met en cache', async () => {
    let calls = 0;
    server.use(
      http.get('https://ensemble-api.open-meteo.com/v1/ensemble', () => {
        calls += 1;
        return HttpResponse.json({ hourly: { time: ['2026-09-28T00:00'], temperature_2m: [10] } });
      }),
    );
    const first = await getEnsemble(place);
    await getEnsemble(place);
    expect(calls).toBe(1);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value.value.temperature).toEqual([[10]]);
    }
  });
});

describe('getNowcast', () => {
  const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

  it('recupere et mappe la precipitation au pas de 15 minutes', async () => {
    server.use(
      http.get(FORECAST_URL, () =>
        HttpResponse.json({
          latitude: 45.49,
          longitude: 5.47,
          elevation: 468,
          timezone: 'Europe/Paris',
          utc_offset_seconds: 7200,
          minutely_15: { time: ['2026-09-28T14:15'], precipitation: [0.2] },
        }),
      ),
    );
    const result = await getNowcast(place);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value.precipitation).toEqual([0.2]);
    }
  });

  it('propage un echec malformed quand minutely_15 est absent du payload', async () => {
    server.use(
      http.get(FORECAST_URL, () =>
        HttpResponse.json({
          latitude: 45.49,
          longitude: 5.47,
          elevation: 468,
          timezone: 'Europe/Paris',
          utc_offset_seconds: 7200,
        }),
      ),
    );
    const result = await getNowcast(place);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('malformed');
    }
  });
});

describe('getVerifications', () => {
  const STATIONS_URL = 'http://localhost:3000/data/stations-fr.json';
  const PREVIOUS_RUNS_URL = 'https://previous-runs-api.open-meteo.com/v1/forecast';
  const REANALYSIS_URL = 'https://archive-api.open-meteo.com/v1/archive';

  it('se replie sur ERA5 quand aucune station de stations-fr.json ne correspond', async () => {
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json([])),
      http.get(PREVIOUS_RUNS_URL, () =>
        HttpResponse.json({
          hourly: { time: ['2026-09-15T10:00'], temperature_2m_previous_day1: [15] },
        }),
      ),
      http.get(REANALYSIS_URL, () =>
        HttpResponse.json({
          hourly: {
            time: ['2026-09-15T10:00'],
            temperature_2m: [14],
            precipitation: [0],
            wind_speed_10m: [10],
          },
        }),
      ),
    );
    const result = await getVerifications(place, ['arome']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value.references.every((r) => r.provenance === 'estimated')).toBe(true);
  });

  it("propage l'echec quand previous-runs-api repond en erreur", async () => {
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json([])),
      http.get(PREVIOUS_RUNS_URL, () => new HttpResponse(null, { status: 500 })),
      http.get(REANALYSIS_URL, () =>
        HttpResponse.json({ hourly: { time: ['2026-09-15T10:00'], temperature_2m: [14] } }),
      ),
    );
    const result = await getVerifications(place, ['arome']);
    expect(result.ok).toBe(false);
  });
});

describe('loadStations', () => {
  const STATIONS_URL = 'http://localhost:3000/data/stations-fr.json';

  it('retourne le tableau du fichier JSON quand il est servi', async () => {
    server.use(
      http.get(STATIONS_URL, () =>
        HttpResponse.json([
          {
            id: '07145',
            name: 'Grenoble - St Geoirs',
            latitude: 45.36,
            longitude: 5.33,
            elevation: 384,
          },
        ]),
      ),
    );
    const stations = await loadStations();
    expect(stations).toHaveLength(1);
    expect(stations[0]?.id).toBe('07145');
  });

  it('retourne un tableau vide quand le fichier est absent (404)', async () => {
    server.use(http.get(STATIONS_URL, () => new HttpResponse(null, { status: 404 })));
    expect(await loadStations()).toEqual([]);
  });

  it("retourne un tableau vide quand le corps n'est pas un tableau", async () => {
    server.use(http.get(STATIONS_URL, () => HttpResponse.json({ oops: true })));
    expect(await loadStations()).toEqual([]);
  });

  it('memorise le resultat : un seul appel reseau pour plusieurs lectures', async () => {
    let calls = 0;
    server.use(
      http.get(STATIONS_URL, () => {
        calls += 1;
        return HttpResponse.json([]);
      }),
    );
    await loadStations();
    await loadStations();
    expect(calls).toBe(1);
  });
});

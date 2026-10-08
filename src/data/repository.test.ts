import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../tests/msw';
import { deleteDbForTests } from './cache/db';
import { resetMemoryDatasetStore, setDataset } from './cache/datasetStore';
import { loadCalibration } from './cache/calibrationStore';
import { loadJournal } from './cache/journalStore';
import { recordOutlook } from './cache/outlookStore';
import { readDiagnostics, resetDiagnosticsForTests } from './cache/diagnostics';
import { resetMemoryForecastStore, setCachedForecast } from './cache/forecastStore';
import { resetMemoryGeocodingStore } from './cache/geocodingStore';
import {
  FORECAST_DAYS,
  getAirQuality,
  getEnsemble,
  getForecast,
  getForecastGrid,
  getLightning,
  getSpreadGrid,
  getNowcast,
  getStationReport,
  getVerifications,
  getVigilance,
  loadDepartments,
  loadStations,
  PAST_DAYS,
  resetDepartmentsForTests,
  resetStationsForTests,
  searchPlaces,
} from './repository';
import type { ForecastBundle, Place } from '../domain/types';
import departments from '../../public/data/departements-fr.json';
import vigilanceRhone from '../../tests/fixtures/live/vigilance-rhone.json';

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
  localStorage.removeItem('meteo-fr:diagnostics');
  resetDiagnosticsForTests();
  await deleteDbForTests();
  resetMemoryForecastStore();
  resetMemoryGeocodingStore();
  resetMemoryDatasetStore();
  resetStationsForTests();
  resetDepartmentsForTests();
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

describe('journal de diagnostic', () => {
  it('note la reussite de la prevision, puis son echec, chacun a part', async () => {
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json(forecastPayload(12)),
      ),
    );
    await getForecast({ place, models: ['arome'] });
    const afterSuccess = readDiagnostics().forecast;
    expect(afterSuccess.lastSuccess).not.toBeNull();
    expect(afterSuccess.lastFailure).toBeNull();

    server.use(http.get('https://api.open-meteo.com/v1/forecast', () => HttpResponse.error()));
    await getForecast({ place, models: ['arome'], forceRefresh: true });
    const afterFailure = readDiagnostics().forecast;
    expect(afterFailure.lastSuccess).toBe(afterSuccess.lastSuccess);
    expect(afterFailure.lastFailure?.kind).toBe('network');
  });

  it('note une reponse de prevision illisible comme un echec', async () => {
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({ latitude: 45.49, longitude: 5.47 }),
      ),
    );
    await getForecast({ place, models: ['arome'] });
    expect(readDiagnostics().forecast.lastFailure?.kind).toBe('malformed');
  });

  it('note les jeux secondaires sous leur propre source, et rien quand le cache suffit', async () => {
    let calls = 0;
    server.use(
      http.get('https://air-quality-api.open-meteo.com/v1/air-quality', () => {
        calls += 1;
        return HttpResponse.json({ hourly: { time: ['2026-09-28T00:00'], european_aqi: [10] } });
      }),
    );
    await getAirQuality(place);
    const first = readDiagnostics().airQuality.lastSuccess;
    expect(first).not.toBeNull();
    expect(readDiagnostics().forecast.lastSuccess).toBeNull();
    await getAirQuality(place);
    expect(calls).toBe(1);
    expect(readDiagnostics().airQuality.lastSuccess).toBe(first);
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

describe('getStationReport', () => {
  const STATIONS_URL = 'http://localhost:3000/data/stations-fr.json';
  const HEADER = 'year,month,day,hour,temp,temp_source,rhum,rhum_source';

  /** Compresse un texte en gzip via l'API Web standard. */
  async function gzip(text: string): Promise<Uint8Array> {
    const body = new Response(text).body;
    if (body === null) {
      return new Uint8Array();
    }
    const compressed = body.pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(compressed).arrayBuffer());
  }

  const nearby = {
    id: '07480',
    name: 'Lyon / Bron',
    latitude: 45.5,
    longitude: 5.5,
    elevation: 450,
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ne telecharge rien quand aucune station ne represente le lieu', async () => {
    let meteostatCalls = 0;
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json([])),
      http.get('https://data.meteostat.net/hourly/:year/:station', () => {
        meteostatCalls += 1;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    const result = await getStationReport(place, ['arome']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toEqual({
      match: null,
      records: [],
      models: null,
      previousDay: null,
      snapshots: [],
    });
    expect(meteostatCalls).toBe(0);
  });

  it('garde les releves des 60 dernieres heures et lit les modeles au point de la station', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T13:27:00Z'));
    const pointRequests: URL[] = [];
    const previousRequests: URL[] = [];
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json([nearby])),
      http.get('https://api.open-meteo.com/v1/forecast', ({ request }) => {
        pointRequests.push(new URL(request.url));
        return HttpResponse.json({
          hourly: { time: ['2026-09-28T11:00', '2026-09-28T12:00'], temperature_2m: [24.1, 25.2] },
        });
      }),
      http.get('https://previous-runs-api.open-meteo.com/v1/forecast', ({ request }) => {
        previousRequests.push(new URL(request.url));
        return HttpResponse.json({
          hourly: { time: ['2026-09-27T12:00'], temperature_2m_previous_day1: [21.5] },
        });
      }),
      http.get('https://data.meteostat.net/hourly/2026/07480.csv.gz', async () => {
        const body = [
          HEADER,
          '2026,9,25,10,9.0,metar,80,metar', // plus de 60 h : ignore
          '2026,9,26,10,12.0,metar,80,metar', // hier n'est pas encore sorti de la fenetre
          '2026,9,28,9,25.0,metar,41,metar',
          '2026,9,28,10,26.0,metar,37,metar',
        ].join('\n');
        return new HttpResponse(await gzip(body));
      }),
    );
    const result = await getStationReport(place, ['arome']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.value.value;
    expect(report.match?.station.id).toBe('07480');
    expect(report.records.map((record) => record.time)).toEqual([
      '2026-09-26T12:00',
      '2026-09-28T11:00',
      '2026-09-28T12:00',
    ]);
    expect(report.records[2]?.temperature).toEqual({ value: 26, provenance: 'observed' });
    // Station a station : coordonnees et altitude de la station, pas du lieu.
    expect(pointRequests).toHaveLength(1);
    expect(pointRequests[0]?.searchParams.get('latitude')).toBe('45.5');
    expect(pointRequests[0]?.searchParams.get('longitude')).toBe('5.5');
    expect(pointRequests[0]?.searchParams.get('elevation')).toBe('450');
    expect(report.models?.temperature.arome).toEqual([24.1, 25.2]);
    // Hier, prevu la veille : meme point et meme altitude que la station.
    expect(previousRequests).toHaveLength(1);
    expect(previousRequests[0]?.searchParams.get('latitude')).toBe('45.5');
    expect(previousRequests[0]?.searchParams.get('elevation')).toBe('450');
    expect(report.previousDay?.temperature.arome).toEqual([21.5]);
  });

  it('garde le bilan d hier au journal du lieu, et rien quand la station manque de mesures', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T13:27:00Z'));
    // Hier 27 septembre, heures locales 2 h a 23 h : 22 mesures et autant de previsions de la veille.
    const day = Array.from({ length: 22 }, (_, i) => i);
    const times = day.map((i) => `2026-09-27T${String(2 + i).padStart(2, '0')}:00`);
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json([nearby])),
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({ hourly: { time: ['2026-09-28T11:00'], temperature_2m: [24] } }),
      ),
      http.get('https://previous-runs-api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({
          hourly: { time: times, temperature_2m_previous_day1: day.map((i) => 15 + i / 2) },
        }),
      ),
      http.get('https://data.meteostat.net/hourly/2026/07480.csv.gz', async () => {
        const rows = day.map((i) => `2026,9,27,${i},${(14 + i / 2).toFixed(1)},metar,70,metar`);
        return new HttpResponse(await gzip([HEADER, ...rows].join('\n')));
      }),
    );
    expect(await loadJournal(place.id)).toEqual([]);
    // Hier a midi (10 h UTC), Relevé avait annonce 21 / 14 °C avec confiance elevee, 24 h avant.
    const issuedAt = new Date('2026-09-27T10:00:00Z').getTime() - 24 * 60 * 60 * 1000;
    await recordOutlook(
      place.id,
      {
        issuedAt,
        days: [
          {
            date: '2026-09-27',
            model: 'arome',
            tempMax: 21,
            tempMin: 14,
            rain: 0,
            confidence: 'high',
          },
        ],
      },
      new Date(issuedAt),
    );
    const result = await getStationReport(place, ['arome']);
    expect(result.ok).toBe(true);
    // La confiance dite la veille est rapprochee de l'erreur mesuree : |21 - 24,5| et |14 - 14|.
    expect(await loadCalibration(place.id)).toEqual([
      { date: '2026-09-27', level: 'high', error: 1.75, model: 'arome', issuedAt },
    ]);
    const journal = await loadJournal(place.id);
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({
      date: '2026-09-27',
      stationName: 'Lyon / Bron',
      hours: 22,
      observedMin: 14,
    });
    expect(journal[0]?.models[0]?.model).toBe('arome');
    // Une prevision de la veille vaut une mesure de plus d'un degre ici : l'ecart est dit, pas lisse.
    expect(journal[0]?.models[0]?.mae).toBeCloseTo(1, 5);
  });

  it('ne laisse rien au journal quand les mesures d hier manquent', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T13:27:00Z'));
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json([nearby])),
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({ hourly: { time: ['2026-09-28T11:00'], temperature_2m: [24] } }),
      ),
      http.get(
        'https://data.meteostat.net/hourly/2026/07480.csv.gz',
        async () =>
          new HttpResponse(await gzip([HEADER, '2026,9,28,10,26.0,metar,37,metar'].join('\n'))),
      ),
    );
    const result = await getStationReport(place, ['arome']);
    expect(result.ok).toBe(true);
    expect(await loadJournal(place.id)).toEqual([]);
  });

  it('enregistre un instantane des 12 heures a venir a chaque lecture, sans en empiler deux pour une meme heure', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T13:27:00Z'));
    const time = Array.from(
      { length: 15 },
      (_, i) => `2026-09-28T${String(10 + i).padStart(2, '0')}:00`,
    );
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json([nearby])),
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({ hourly: { time, temperature_2m: time.map((_, i) => 20 + i) } }),
      ),
      http.get('https://data.meteostat.net/hourly/2026/07480.csv.gz', async () => {
        return new HttpResponse(
          await gzip([HEADER, '2026,9,28,10,26.0,metar,37,metar'].join('\n')),
        );
      }),
    );
    const first = await getStationReport(place, ['arome']);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const snapshots = first.value.value.snapshots;
    expect(snapshots).toHaveLength(1);
    // 15 h 27 locales : relevee a 15 h, puis 16 h a 24 h (la serie s'arrete a minuit).
    expect(snapshots[0]?.issuedAt).toBe('2026-09-28T15:00');
    expect(snapshots[0]?.timeline[0]).toBe('2026-09-28T16:00');
    expect(snapshots[0]?.temperature.arome?.[0]).toBe(26);

    expect(snapshots[0]?.timeline).toHaveLength(9);

    // Deux heures plus tard, la station est relue : un second instantane s'ajoute au premier.
    vi.setSystemTime(new Date('2026-09-28T15:27:00Z'));
    const second = await getStationReport(place, ['arome']);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.value.snapshots.map((s) => s.issuedAt)).toEqual([
      '2026-09-28T15:00',
      '2026-09-28T17:00',
    ]);
  });

  it('rend les releves sans modeles quand le point de station ne repond pas', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T13:27:00Z'));
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json([nearby])),
      http.get(
        'https://api.open-meteo.com/v1/forecast',
        () => new HttpResponse(null, { status: 400 }),
      ),
      http.get('https://data.meteostat.net/hourly/2026/07480.csv.gz', async () => {
        return new HttpResponse(
          await gzip([HEADER, '2026,9,28,10,26.0,metar,37,metar'].join('\n')),
        );
      }),
    );
    const result = await getStationReport(place, ['arome']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value.records).toHaveLength(1);
    expect(result.value.value.models).toBeNull();
    // Les previsions de la veille ne sont pas simulees ici : refusees, donc absentes.
    expect(result.value.value.previousDay).toBeNull();
  });

  it("garde l'annee precedente quand le fichier de la nouvelle annee manque", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-01T05:00:00Z'));
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json([nearby])),
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({ hourly: { time: [], temperature_2m: [] } }),
      ),
      http.get(
        'https://data.meteostat.net/hourly/2026/07480.csv.gz',
        async () =>
          new HttpResponse(await gzip([HEADER, '2026,12,31,22,3.0,metar,90,metar'].join('\n'))),
      ),
      http.get(
        'https://data.meteostat.net/hourly/2027/07480.csv.gz',
        () => new HttpResponse(null, { status: 404 }),
      ),
    );
    const result = await getStationReport(place, ['arome']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value.records.map((record) => record.time)).toEqual(['2026-12-31T23:00']);
  });

  it('propage l echec quand aucun fichier ne repond', async () => {
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json([nearby])),
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({ hourly: { time: [], temperature_2m: [] } }),
      ),
      http.get(
        'https://data.meteostat.net/hourly/:year/:station',
        () => new HttpResponse(null, { status: 404 }),
      ),
    );
    const result = await getStationReport(place, ['arome']);
    expect(result.ok).toBe(false);
  });
});

describe('getForecastGrid', () => {
  it('interroge toute la grille en une requete et la met en cache par modele', async () => {
    const requests: URL[] = [];
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        const count = url.searchParams.get('latitude')?.split(',').length ?? 0;
        return HttpResponse.json(
          Array.from({ length: count }, () => ({
            hourly: { time: ['2026-09-28T16:00'], temperature_2m: [21], precipitation: [0] },
          })),
        );
      }),
    );
    const first = await getForecastGrid(place, 'arome');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.value.points).toHaveLength(81);
    expect(first.value.value.temperature[0]).toHaveLength(81);

    await getForecastGrid(place, 'arome');
    expect(requests).toHaveLength(1);
    await getForecastGrid(place, 'ecmwf');
    expect(requests).toHaveLength(2);
    expect(requests[1]?.searchParams.get('models')).toBe('ecmwf_ifs025');
  });
});

describe('getSpreadGrid', () => {
  const FORECAST = 'https://api.open-meteo.com/v1/forecast';
  /** Chaque modele annonce une temperature differente : 10, 12, 15, 11 degres. */
  const TEMPERATURES: Record<string, number> = {
    meteofrance_arome_france: 10,
    meteofrance_arpege_europe: 12,
    ecmwf_ifs025: 15,
    gfs_seamless: 11,
  };

  it('compare les grilles des quatre modeles et rend l ecart de chaque case', async () => {
    server.use(
      http.get(FORECAST, ({ request }) => {
        const url = new URL(request.url);
        const count = url.searchParams.get('latitude')?.split(',').length ?? 0;
        const temperature = TEMPERATURES[url.searchParams.get('models') ?? ''] ?? 0;
        return HttpResponse.json(
          Array.from({ length: count }, () => ({
            hourly: {
              time: ['2026-09-28T16:00'],
              temperature_2m: [temperature],
              precipitation: [0],
            },
          })),
        );
      }),
    );
    const result = await getSpreadGrid(place);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value.models).toEqual(['arome_france', 'arpege', 'ecmwf', 'gfs']);
    expect(result.value.value.grid.temperature[0]?.[0]).toBe(5);
    expect(result.value.stale).toBe(false);
  });

  it('ecarte un modele qui ne repond pas, tant qu il en reste deux', async () => {
    server.use(
      http.get(FORECAST, ({ request }) => {
        const url = new URL(request.url);
        const model = url.searchParams.get('models') ?? '';
        if (model === 'gfs_seamless') {
          return new HttpResponse(null, { status: 500 });
        }
        const count = url.searchParams.get('latitude')?.split(',').length ?? 0;
        return HttpResponse.json(
          Array.from({ length: count }, () => ({
            hourly: {
              time: ['2026-09-28T16:00'],
              temperature_2m: [TEMPERATURES[model] ?? 0],
              precipitation: [0],
            },
          })),
        );
      }),
    );
    const result = await getSpreadGrid(place);
    expect(result.ok && result.value.value.models).toEqual(['arome_france', 'arpege', 'ecmwf']);
  });

  it('rend l echec quand moins de deux modeles repondent', async () => {
    server.use(http.get(FORECAST, () => new HttpResponse(null, { status: 500 })));
    const result = await getSpreadGrid(place);
    expect(result.ok).toBe(false);
  });

  it('dit « moins de deux grilles » quand les grilles ne s alignent pas', async () => {
    server.use(
      http.get(FORECAST, ({ request }) => {
        const url = new URL(request.url);
        const model = url.searchParams.get('models') ?? '';
        const count = url.searchParams.get('latitude')?.split(',').length ?? 0;
        // Un instant different par modele : aucune grille ne s'aligne sur une autre.
        return HttpResponse.json(
          Array.from({ length: count }, () => ({
            hourly: {
              time: [
                `2026-09-28T${String(10 + Object.keys(TEMPERATURES).indexOf(model)).padStart(2, '0')}:00`,
              ],
              temperature_2m: [1],
              precipitation: [0],
            },
          })),
        );
      }),
    );
    const result = await getSpreadGrid(place);
    expect(result).toMatchObject({ ok: false, failure: { kind: 'malformed' } });
  });
});

describe('getVigilance', () => {
  const DEPARTMENTS_URL = 'http://localhost:3000/data/departements-fr.json';
  const VIGILANCE_URL =
    'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/weatherref-france-vigilance-meteo-departement/records';
  const lyon: Place = { ...place, id: '45.7485:4.8467', latitude: 45.7485, longitude: 4.8467 };

  it('interroge le departement du lieu, puis sert le cache dans le TTL', async () => {
    const wheres: (string | null)[] = [];
    server.use(
      http.get(DEPARTMENTS_URL, () => HttpResponse.json(departments)),
      http.get(VIGILANCE_URL, ({ request }) => {
        wheres.push(new URL(request.url).searchParams.get('where'));
        return HttpResponse.json(vigilanceRhone);
      }),
    );
    const first = await getVigilance(lyon);
    const second = await getVigilance(lyon);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.value.department).toEqual({ code: '69', name: 'Rhône' });
    expect(first.value.value.bulletin?.department).toBe('69');
    expect(wheres).toEqual(['domain_id in ("69","6910")']);
  });

  it('ne demande rien pour un lieu hors des departements', async () => {
    let calls = 0;
    server.use(
      http.get(DEPARTMENTS_URL, () => HttpResponse.json(departments)),
      http.get(VIGILANCE_URL, () => {
        calls += 1;
        return HttpResponse.json(vigilanceRhone);
      }),
    );
    const result = await getVigilance({ ...place, id: 'geneve', latitude: 46.2, longitude: 6.15 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toEqual({ department: null, bulletin: null });
    expect(calls).toBe(0);
  });

  it("remonte l'echec du service de vigilance", async () => {
    server.use(
      http.get(DEPARTMENTS_URL, () => HttpResponse.json(departments)),
      http.get(VIGILANCE_URL, () => new HttpResponse(null, { status: 404 })),
    );
    const result = await getVigilance(lyon);
    expect(result.ok).toBe(false);
  });

  it('se contente de contours vides quand le fichier manque, et ne le charge qu une fois', async () => {
    let calls = 0;
    server.use(
      http.get(DEPARTMENTS_URL, () => {
        calls += 1;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    expect(await loadDepartments()).toEqual([]);
    expect(await loadDepartments()).toEqual([]);
    expect(calls).toBe(1);
  });
});

describe('getLightning', () => {
  const CAPABILITIES_URL = 'https://view.eumetsat.int/geoserver/mtg_fd/li_afa/ows';
  const LYON = { latitude: 45.75, longitude: 4.85 };

  beforeEach(() => {
    localStorage.removeItem('meteo-fr:diagnostics');
    resetDiagnosticsForTests();
  });

  it('rend les images et note la lecture reussie au journal', async () => {
    server.use(
      http.get(CAPABILITIES_URL, () =>
        HttpResponse.text('<Dimension name="time" default="2026-10-01T11:30:00Z">x</Dimension>'),
      ),
    );
    const result = await getLightning(LYON);
    expect(result.ok).toBe(true);
    expect(readDiagnostics().lightning.lastSuccess).not.toBeNull();
  });

  it("note l'echec de la lecture au journal", async () => {
    server.use(http.get(CAPABILITIES_URL, () => HttpResponse.error()));
    const failed = await getLightning(LYON);
    expect(failed.ok).toBe(false);
    expect(readDiagnostics().lightning.lastFailure?.kind).toBe('network');
  });

  it("ne note pas une lecture interrompue par l'utilisateur", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = await getLightning(LYON, controller.signal);
    expect(aborted).toMatchObject({ ok: false, failure: { kind: 'aborted' } });
    expect(readDiagnostics().lightning.lastFailure).toBeNull();
  });
});

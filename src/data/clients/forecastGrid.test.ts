import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import { gridPoints } from '../../domain/grid';
import {
  GRID_HOURS,
  buildForecastGridUrl,
  fetchForecastGrid,
  mapForecastGrid,
} from './forecastGrid';

const POINTS = gridPoints({ latitude: 45.7578, longitude: 4.832 }, 3, 12.5);

function pointPayload(
  times: readonly string[],
  temperature: readonly (number | null)[],
  precipitation?: readonly (number | null)[],
) {
  return {
    latitude: 45.75,
    longitude: 4.83,
    hourly: {
      time: times,
      temperature_2m: temperature,
      ...(precipitation === undefined ? {} : { precipitation }),
      wind_speed_10m: temperature.map(() => 12),
      wind_direction_10m: temperature.map(() => 200),
      cape: temperature.map((_, i) => (i === 0 ? 850 : null)),
      weather_code: temperature.map(() => 95),
    },
  };
}

describe('buildForecastGridUrl', () => {
  it('passe les coordonnees en listes paralleles, un seul modele, 48 heures', () => {
    const url = new URL(buildForecastGridUrl({ points: POINTS, model: 'arome' }));
    const latitudes = url.searchParams.get('latitude')?.split(',') ?? [];
    const longitudes = url.searchParams.get('longitude')?.split(',') ?? [];
    expect(latitudes).toHaveLength(9);
    expect(longitudes).toHaveLength(9);
    expect(Number(latitudes[4])).toBe(POINTS[4]?.latitude);
    expect(Number(longitudes[4])).toBe(POINTS[4]?.longitude);
    expect(url.searchParams.get('models')).toBe('meteofrance_arome_france_hd');
    expect(url.searchParams.get('forecast_hours')).toBe(String(GRID_HOURS));
    expect(url.searchParams.get('hourly')).toBe(
      'temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,cape,weather_code',
    );
    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
  });
});

describe('mapForecastGrid', () => {
  const TIMES = ['2026-09-28T16:00', '2026-09-28T17:00'];

  it('range les valeurs par instant puis par point, dans l ordre de la grille', () => {
    const raw = POINTS.map((_, index) =>
      pointPayload(TIMES, [20 + index, 10 + index], [index === 4 ? 1.2 : 0, 0]),
    );
    const result = mapForecastGrid({ raw, points: POINTS, model: 'arome', stepKm: 12.5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const grid = result.value;
    expect(grid.provenance).toBe('forecast');
    expect(grid.times).toEqual(TIMES);
    expect(grid.temperature[0]?.[4]).toBe(24);
    expect(grid.temperature[1]?.[8]).toBe(18);
    expect(grid.precipitation[0]?.[4]).toBe(1.2);
    expect(grid.windDirection[1]?.[0]).toBe(200);
    // CAPE et code meteo suivent le meme rangement ; une CAPE absente reste null.
    expect(grid.cape[0]?.[3]).toBe(850);
    expect(grid.cape[1]?.[3]).toBeNull();
    expect(grid.weatherCode[1]?.[8]).toBe(95);
  });

  it("aligne chaque point sur l'heure, et garde null pour une valeur ou une variable absente", () => {
    const raw = POINTS.map((_, index) =>
      index === 2
        ? // Point decale d'une heure, sans colonne de pluie.
          pointPayload(['2026-09-28T17:00'], [30])
        : pointPayload(TIMES, [20, null], [0.4, 0.2]),
    );
    const result = mapForecastGrid({ raw, points: POINTS, model: 'arome', stepKm: 12.5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.temperature[0]?.[2]).toBeNull();
    expect(result.value.temperature[1]?.[2]).toBe(30);
    expect(result.value.temperature[1]?.[0]).toBeNull();
    expect(result.value.precipitation[1]?.[2]).toBeNull();
    expect(result.value.precipitation[1]?.[0]).toBe(0.2);
  });

  it('refuse une reponse qui n a pas un objet par point', () => {
    expect(
      mapForecastGrid({ raw: { hourly: {} }, points: POINTS, model: 'arome', stepKm: 12.5 }).ok,
    ).toBe(false);
    expect(
      mapForecastGrid({
        raw: [pointPayload(TIMES, [1, 2])],
        points: POINTS,
        model: 'arome',
        stepKm: 12.5,
      }).ok,
    ).toBe(false);
  });

  it('refuse une grille sans instants', () => {
    const raw = POINTS.map(() => ({ latitude: 45, longitude: 4 }));
    const result = mapForecastGrid({ raw, points: POINTS, model: 'arome', stepKm: 12.5 });
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'malformed', detail: 'grille sans bloc horaire' },
    });
  });
});

describe('fetchForecastGrid', () => {
  it('interroge Open-Meteo et rend la grille', async () => {
    const requested: URL[] = [];
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', ({ request }) => {
        requested.push(new URL(request.url));
        return HttpResponse.json(POINTS.map(() => pointPayload(['2026-09-28T16:00'], [21])));
      }),
    );
    const result = await fetchForecastGrid({ points: POINTS, model: 'icon_d2', stepKm: 12.5 });
    expect(result.ok).toBe(true);
    expect(requested[0]?.searchParams.get('models')).toBe('icon_d2');
  });

  it("propage l'echec reseau", async () => {
    server.use(
      http.get(
        'https://api.open-meteo.com/v1/forecast',
        () => new HttpResponse(null, { status: 400 }),
      ),
    );
    const result = await fetchForecastGrid({ points: POINTS, model: 'arome', stepKm: 12.5 });
    expect(result.ok).toBe(false);
  });
});

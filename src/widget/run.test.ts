import 'fake-indexeddb/auto';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import forecastLyon from '../../tests/fixtures/live/forecast-lyon.json';
import { server } from '../../tests/msw';
import { deleteDbForTests } from '../data/cache/db';
import { resetMemoryDatasetStore } from '../data/cache/datasetStore';
import { saveWatchEntries } from '../data/cache/watchStore';
import type { WatchEntry } from '../domain/watch';
import { WIDGET_MAX_PLACES } from './payload';
import { placeFromSearch, runWidget } from './run';

const NOW = new Date('2026-09-28T13:27:00Z');
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

function entry(id: string, name: string, latitude = 45.7578): WatchEntry {
  return {
    place: {
      id,
      name,
      latitude,
      longitude: 4.832,
      elevation: 170,
      admin: '',
      alias: null,
    },
    department: null,
    rules: [],
    terrain: null,
    verification: [],
    preferred: null,
  };
}

beforeEach(async () => {
  resetMemoryDatasetStore();
  await deleteDbForTests();
});

describe('placeFromSearch', () => {
  it('lit un lieu de l adresse, avec son nom et son altitude', () => {
    expect(placeFromSearch('?lat=45.49&lon=5.47&nom=Virieu&alt=468')).toMatchObject({
      id: '45.4900:5.4700',
      name: 'Virieu',
      latitude: 45.49,
      longitude: 5.47,
      elevation: 468,
    });
    expect(placeFromSearch('?lat=45.49&lon=5.47')?.name).toBe('Lieu');
  });

  it('rend null sans coordonnees valides', () => {
    expect(placeFromSearch('')).toBeNull();
    expect(placeFromSearch('?lat=45.49')).toBeNull();
    expect(placeFromSearch('?lat=x&lon=5')).toBeNull();
  });
});

describe('runWidget', () => {
  it('lit les lieux veilles recopies par la page et calcule le contenu de chacun', async () => {
    server.use(http.get(FORECAST_URL, () => HttpResponse.json(forecastLyon)));
    await saveWatchEntries([entry('lyon', 'Lyon'), entry('brest', 'Brest')], 'kmh', NOW);
    const payload = await runWidget('', NOW);
    expect(payload.places.map((place) => place.id)).toEqual(['lyon', 'brest']);
    expect(payload.unreachable).toEqual([]);
    expect(payload.places[0]?.now?.model).toBeTruthy();
  });

  it('se limite au nombre de lieux du widget, et signale celui dont la prevision echoue', async () => {
    server.use(
      http.get(FORECAST_URL, ({ request }) =>
        // Un lieu dont la prevision echoue de facon durable (apres les reessais).
        new URL(request.url).searchParams.get('latitude') === '46.5'
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(forecastLyon),
      ),
    );
    const entries = [
      entry('p0', 'P0', 45.7578),
      entry('p1', 'P1', 46.5),
      entry('p2', 'P2', 45.7578),
      entry('p3', 'P3', 45.7578),
      entry('p4', 'P4', 45.7578),
    ];
    await saveWatchEntries(entries, 'kmh', NOW);
    const payload = await runWidget('', NOW);
    expect(payload.places.map((place) => place.id)).toEqual(['p0', 'p2']);
    expect(payload.unreachable).toEqual(['p1']);
    expect(payload.places.length + payload.unreachable.length).toBe(WIDGET_MAX_PLACES);
  });

  it('prend le lieu de l adresse quand aucun lieu n a ete recopie', async () => {
    server.use(http.get(FORECAST_URL, () => HttpResponse.json(forecastLyon)));
    const payload = await runWidget('?lat=45.7578&lon=4.832&nom=Lyon', NOW);
    expect(payload.places).toHaveLength(1);
    expect(payload.places[0]?.name).toBe('Lyon');
  });

  it('rend un contenu vide sans lieu recopie ni lieu dans l adresse', async () => {
    const payload = await runWidget('', NOW);
    expect(payload.places).toEqual([]);
    expect(payload.unreachable).toEqual([]);
  });

  it('garde les lieux recopies plutot que celui de l adresse', async () => {
    server.use(http.get(FORECAST_URL, () => HttpResponse.json(forecastLyon)));
    await saveWatchEntries([entry('lyon', 'Lyon')], 'kmh', NOW);
    const payload = await runWidget('?lat=48&lon=2&nom=Paris', NOW);
    expect(payload.places.map((place) => place.id)).toEqual(['lyon']);
  });
});

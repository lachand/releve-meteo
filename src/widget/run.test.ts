import 'fake-indexeddb/auto';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import forecastLyon from '../../tests/fixtures/live/forecast-lyon.json';
import vigilanceRhone from '../../tests/fixtures/live/vigilance-rhone.json';
import { server } from '../../tests/msw';
import { deleteDbForTests } from '../data/cache/db';
import { resetMemoryDatasetStore } from '../data/cache/datasetStore';
import { saveWatchEntries } from '../data/cache/watchStore';
import type { WatchEntry } from '../domain/watch';
import { WIDGET_MAX_PLACES } from './payload';
import { placeFromSearch, runWidget } from './run';

const NOW = new Date('2026-09-28T13:27:00Z');
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const VIGILANCE_URL =
  'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/weatherref-france-vigilance-meteo-departement/records';

/** Bulletin du Rhone ou les orages du jour passent a `level`. */
function rhoneWithStorms(level: number) {
  return {
    ...vigilanceRhone,
    results: vigilanceRhone.results.map((record) =>
      record.phenomenon_id === 3 && record.echeance === 'J'
        ? { ...record, color_id: level }
        : record,
    ),
  };
}

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
    // Un de plus que la limite, dont le deuxieme est injoignable.
    const entries = Array.from({ length: WIDGET_MAX_PLACES + 1 }, (_, index) =>
      entry(`p${index}`, `P${index}`, index === 1 ? 46.5 : 45.7578),
    );
    await saveWatchEntries(entries, 'kmh', NOW);
    const payload = await runWidget('', NOW);
    expect(payload.places.map((place) => place.id)).toEqual(
      Array.from({ length: WIDGET_MAX_PLACES }, (_, index) => `p${index}`).filter(
        (id) => id !== 'p1',
      ),
    );
    expect(payload.unreachable).toEqual(['p1']);
    expect(payload.places.length + payload.unreachable.length).toBe(WIDGET_MAX_PLACES);
  });

  it('lit la vigilance une fois par departement et la met dans les notes de chaque lieu', async () => {
    let bulletins = 0;
    server.use(
      http.get(FORECAST_URL, () => HttpResponse.json(forecastLyon)),
      http.get(VIGILANCE_URL, () => {
        bulletins += 1;
        return HttpResponse.json(rhoneWithStorms(3));
      }),
    );
    const rhone = { code: '69', name: 'Rhône' };
    await saveWatchEntries(
      [
        { ...entry('lyon', 'Lyon'), department: rhone },
        { ...entry('villeurbanne', 'Villeurbanne'), department: rhone },
        entry('sans', 'Sans departement'),
      ],
      'kmh',
      NOW,
    );
    const payload = await runWidget('', NOW);
    expect(bulletins).toBe(1);
    const kinds = (id: string) =>
      payload.places.find((place) => place.id === id)?.notes.map((note) => note.kind) ?? [];
    expect(kinds('lyon')).toContain('vigilance');
    expect(kinds('villeurbanne')).toContain('vigilance');
    expect(kinds('sans')).not.toContain('vigilance');
  });

  it('ignore une vigilance illisible : le widget garde ses autres notes', async () => {
    server.use(
      http.get(FORECAST_URL, () => HttpResponse.json(forecastLyon)),
      http.get(VIGILANCE_URL, () => new HttpResponse(null, { status: 500 })),
    );
    await saveWatchEntries(
      [{ ...entry('lyon', 'Lyon'), department: { code: '69', name: 'Rhône' } }],
      'kmh',
      NOW,
    );
    const payload = await runWidget('', NOW);
    expect(payload.places).toHaveLength(1);
    expect(payload.places[0]?.notes.map((note) => note.kind)).not.toContain('vigilance');
    expect(payload.places[0]?.notes.length).toBeGreaterThan(0);
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

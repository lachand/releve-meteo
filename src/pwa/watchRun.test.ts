import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../tests/msw';
import forecastLyon from '../../tests/fixtures/live/forecast-lyon.json';
import vigilanceRhone from '../../tests/fixtures/live/vigilance-rhone.json';
import type { WatchEntry, WatchState } from '../domain/watch';
import { collectWatchNotifications } from './watchRun';

const NOW = new Date('2026-09-28T13:27:00Z');
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const VIGILANCE_URL =
  'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/weatherref-france-vigilance-meteo-departement/records';

const LYON: WatchEntry = {
  place: {
    id: '45.7578:4.8320',
    name: 'Lyon',
    latitude: 45.7578,
    longitude: 4.832,
    elevation: 170,
    admin: 'Rhône',
    alias: null,
  },
  department: { code: '69', name: 'Rhône' },
  rules: [
    {
      id: 'chaud',
      placeId: '45.7578:4.8320',
      variable: 'temperature',
      comparator: 'gt',
      threshold: 25,
      enabled: true,
    },
  ],
  terrain: null,
  verification: [],
  preferred: null,
};

function state(entries: readonly WatchEntry[], notified: Record<string, number> = {}): WatchState {
  return { entries, windUnit: 'kmh', notified, lastRunUtcMs: null };
}

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

describe('collectWatchNotifications', () => {
  it('notifie l alerte franchie avec le modele de la cascade, et la vigilance orange', async () => {
    const forecastParams: URLSearchParams[] = [];
    server.use(
      http.get(FORECAST_URL, ({ request }) => {
        forecastParams.push(new URL(request.url).searchParams);
        return HttpResponse.json(forecastLyon);
      }),
      http.get(VIGILANCE_URL, () => HttpResponse.json(rhoneWithStorms(3))),
    );
    const notifications = await collectWatchNotifications(state([LYON]), NOW);
    expect(notifications).toEqual([
      {
        key: 'vigilance|69|thunderstorm|3|1790604000000|terre',
        title: 'Vigilance orange orages · Rhône (69)',
        body: 'Aujourd’hui, de 16h à minuit. Bulletin Météo-France de 16h, pour Lyon.',
        url: '/?lat=45.7578&lon=4.832&nom=Lyon&alt=170&dep=Rh%C3%B4ne',
      },
      {
        key: expect.stringMatching(/^alerte\|chaud\|2026-09-28T\d\d:00$/) as unknown as string,
        title: 'Lyon · Température au-dessus de 25 °C',
        body: expect.stringMatching(/^Dès lundi 16h, .* selon AROME, .*\.$/) as unknown as string,
        url: '/?lat=45.7578&lon=4.832&nom=Lyon&alt=170&dep=Rh%C3%B4ne',
      },
    ]);
    // Toute la cascade, sur l'horizon d'alerte seulement.
    expect(forecastParams[0]?.get('forecast_days')).toBe('4');
    expect(forecastParams[0]?.get('models')?.split(',').length).toBeGreaterThan(3);
  });

  it('ne renotifie pas ce qui est deja connu, ni une vigilance jaune', async () => {
    server.use(
      http.get(FORECAST_URL, () => HttpResponse.json(forecastLyon)),
      http.get(VIGILANCE_URL, () => HttpResponse.json(rhoneWithStorms(2))),
    );
    const first = await collectWatchNotifications(state([LYON]), NOW);
    expect(first.map((n) => n.key)).toEqual([expect.stringMatching(/^alerte\|chaud\|/)]);
    const known = Object.fromEntries(first.map((n) => [n.key, NOW.getTime()]));
    expect(await collectWatchNotifications(state([LYON], known), NOW)).toEqual([]);
  });

  it('lit un bulletin par departement, et saute un lieu dont la prevision echoue', async () => {
    let vigilanceCalls = 0;
    server.use(
      http.get(FORECAST_URL, () => new HttpResponse(null, { status: 400 })),
      http.get(VIGILANCE_URL, () => {
        vigilanceCalls += 1;
        return HttpResponse.json(rhoneWithStorms(3));
      }),
    );
    const villeurbanne: WatchEntry = {
      ...LYON,
      place: { ...LYON.place, id: 'villeurbanne', name: 'Villeurbanne' },
    };
    const notifications = await collectWatchNotifications(state([LYON, villeurbanne]), NOW);
    expect(notifications.map((n) => n.title)).toEqual(['Vigilance orange orages · Rhône (69)']);
    expect(vigilanceCalls).toBe(1);
  });

  it('se tait sans departement, sans regle active ou quand tout echoue', async () => {
    server.use(
      http.get(FORECAST_URL, () => HttpResponse.json({ nonsense: true })),
      http.get(VIGILANCE_URL, () => new HttpResponse(null, { status: 500 })),
    );
    const noDepartment: WatchEntry = { ...LYON, department: null };
    const disabled: WatchEntry = {
      ...LYON,
      rules: LYON.rules.map((rule) => ({ ...rule, enabled: false })),
    };
    expect(await collectWatchNotifications(state([noDepartment, disabled, LYON]), NOW)).toEqual([]);
  });
});

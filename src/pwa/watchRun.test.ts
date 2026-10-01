import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../tests/msw';
import forecastLyon from '../../tests/fixtures/live/forecast-lyon.json';
import vigilanceRhone from '../../tests/fixtures/live/vigilance-rhone.json';
import type { WatchEntry, WatchState } from '../domain/watch';
import { collectWatchNotifications } from './watchRun';

const NOW = new Date('2026-09-28T13:27:00Z');
// 9 h 12 a Paris le meme jour : dans la matinee du resume.
const MORNING = new Date('2026-09-28T07:12:00Z');
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

function state(
  entries: readonly WatchEntry[],
  notified: Record<string, number> = {},
  digest = false,
): WatchState {
  return { entries, windUnit: 'kmh', notified, lastRunUtcMs: null, digest };
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

  it('notifie un desaccord entre modeles une seule fois, et se tait sous le seuil', async () => {
    server.use(http.get(FORECAST_URL, () => HttpResponse.json(forecastLyon)));
    const placeId = '45.7578:4.8320';
    const spreadRule = (threshold: number): WatchEntry => ({
      ...LYON,
      department: null,
      rules: [
        {
          id: 'ecart',
          placeId,
          variable: 'temperature',
          comparator: 'gt',
          threshold,
          enabled: true,
          kind: 'spread',
        },
      ],
    });
    const found = await collectWatchNotifications(state([spreadRule(0.5)]), NOW);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      key: expect.stringMatching(/^ecart\|ecart\|2026-09-2\dT\d\d:00$/) as unknown as string,
      title: 'Lyon · Modèles en désaccord de plus de 0,5\u00a0°C sur la température',
      body: expect.stringMatching(/^Dès .*d’écart.*\(.*°C.*\).*\.$/s) as unknown as string,
    });
    // Une seconde veille ne renotifie rien.
    const known = Object.fromEntries(found.map((n) => [n.key, NOW.getTime()]));
    expect(await collectWatchNotifications(state([spreadRule(0.5)], known), NOW)).toEqual([]);
    // Un seuil que les modeles n'atteignent pas : rien.
    expect(await collectWatchNotifications(state([spreadRule(60)]), NOW)).toEqual([]);
  });

  describe('resume du matin', () => {
    const NO_RULES: WatchEntry = { ...LYON, department: null, rules: [] };
    const BREST: WatchEntry = {
      ...NO_RULES,
      place: { ...LYON.place, id: 'brest', name: 'Brest', alias: 'Chez nous' },
    };

    it('envoie le bulletin du moment et les 24 heures, a la premiere veille de la matinee', async () => {
      server.use(http.get(FORECAST_URL, () => HttpResponse.json(forecastLyon)));
      const found = await collectWatchNotifications(state([NO_RULES], {}, true), MORNING);
      expect(found).toHaveLength(1);
      const digest = found[0];
      expect(digest?.key).toBe('resume|2026-09-28|45.7578:4.8320');
      expect(digest?.title).toBe('Lyon · Résumé du matin');
      // Le modele est nomme, l'ecart des autres chiffre, puis les 24 heures.
      expect(digest?.body).toMatch(/^[A-Z][\w -]+ prévoit \d+\u00a0?°C\./u);
      expect(digest?.body).toContain('autres modèles s’en écartent');
      expect(digest?.body).toMatch(/Sur 24\u00a0h\u00a0: de .* à .*°C/u);
      expect(digest?.url).toBe('/?lat=45.7578&lon=4.832&nom=Lyon&alt=170&dep=Rh%C3%B4ne');
    });

    it('ne part qu une fois par jour et par lieu', async () => {
      server.use(http.get(FORECAST_URL, () => HttpResponse.json(forecastLyon)));
      const first = await collectWatchNotifications(state([NO_RULES], {}, true), MORNING);
      const known = Object.fromEntries(first.map((n) => [n.key, MORNING.getTime()]));
      expect(await collectWatchNotifications(state([NO_RULES], known, true), MORNING)).toEqual([]);
      // Le lendemain matin, un nouveau resume.
      const tomorrow = new Date(MORNING.getTime() + 24 * 3600 * 1000);
      const next = await collectWatchNotifications(state([NO_RULES], known, true), tomorrow);
      expect(next.map((n) => n.key)).toEqual(['resume|2026-09-29|45.7578:4.8320']);
    });

    it('reste muet sans l accord de l utilisateur, hors matinee, ou sans prevision', async () => {
      let calls = 0;
      server.use(
        http.get(FORECAST_URL, () => {
          calls += 1;
          return HttpResponse.json(forecastLyon);
        }),
      );
      expect(await collectWatchNotifications(state([NO_RULES], {}, false), MORNING)).toEqual([]);
      expect(await collectWatchNotifications(state([NO_RULES], {}, true), NOW)).toEqual([]);
      // Aucune requete inutile : ni regle ni resume du moment.
      expect(calls).toBe(0);
      server.use(http.get(FORECAST_URL, () => new HttpResponse(null, { status: 500 })));
      expect(await collectWatchNotifications(state([NO_RULES], {}, true), MORNING)).toEqual([]);
    });

    it('se limite aux premiers lieux, un resume chacun, avec le nom choisi par l utilisateur', async () => {
      server.use(http.get(FORECAST_URL, () => HttpResponse.json(forecastLyon)));
      const places = ['a', 'b', 'c', 'd'].map((id) => ({
        ...BREST,
        place: { ...BREST.place, id, name: id, alias: null },
      }));
      const found = await collectWatchNotifications(state(places, {}, true), MORNING);
      expect(found.map((n) => n.key)).toEqual([
        'resume|2026-09-28|a',
        'resume|2026-09-28|b',
        'resume|2026-09-28|c',
      ]);
      const alias = await collectWatchNotifications(state([BREST], {}, true), MORNING);
      expect(alias[0]?.title).toBe('Chez nous · Résumé du matin');
    });

    it('annonce la confiance quand le terrain est connu', async () => {
      server.use(http.get(FORECAST_URL, () => HttpResponse.json(forecastLyon)));
      const withTerrain: WatchEntry = {
        ...NO_RULES,
        terrain: { kind: 'plain', elevation: 170, distanceToCoastKm: 200 },
      };
      const found = await collectWatchNotifications(state([withTerrain], {}, true), MORNING);
      expect(found[0]?.body).toMatch(/confiance (élevée|moyenne|faible)/);
    });

    it('n annonce pas de confiance sans terrain connu', async () => {
      server.use(http.get(FORECAST_URL, () => HttpResponse.json(forecastLyon)));
      const found = await collectWatchNotifications(state([NO_RULES], {}, true), MORNING);
      expect(found[0]?.body).not.toContain('confiance');
    });
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

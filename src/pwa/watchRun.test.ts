import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../tests/msw';
import forecastLyon from '../../tests/fixtures/live/forecast-lyon.json';
import vigilanceRhone from '../../tests/fixtures/live/vigilance-rhone.json';
import type { WatchEntry, WatchState } from '../domain/watch';
import { DEFAULT_NOTIFY } from '../domain/weatherNotices';
import type { NotifyPrefs } from '../domain/weatherNotices';
import airQualityLyon from '../../tests/fixtures/live/air-quality-lyon.json';
import { collectWatchNotifications } from './watchRun';

const NOW = new Date('2026-09-28T13:27:00Z');
// 9 h 12 a Paris le meme jour : dans la matinee du resume.
const MORNING = new Date('2026-09-28T07:12:00Z');
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
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
  notify: Partial<NotifyPrefs> = {},
): WatchState {
  return {
    entries,
    windUnit: 'kmh',
    notified,
    lastRunUtcMs: null,
    digest,
    notify: { ...DEFAULT_NOTIFY, ...notify },
  };
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

  describe('risques, pluie et pollens', () => {
    const NO_RULES: WatchEntry = { ...LYON, department: null, rules: [] };
    const ID = LYON.place.id;
    // Index horaires du jeu enregistre : 27/09 a 0 h = 0, donc 28/09 a 9 h = 33, a 15 h = 39.

    /** Prevision enregistree dont les rafales et la pluie de chaque modele sont reecrites. */
    function forecastWith(patch: {
      gusts?: Record<number, number>;
      rain?: Record<number, number>;
    }) {
      const hourly: Record<string, unknown> = { ...forecastLyon.hourly };
      for (const key of Object.keys(hourly)) {
        const values = hourly[key];
        if (!Array.isArray(values)) {
          continue;
        }
        if (key.startsWith('wind_gusts_10m')) {
          hourly[key] = values.map((v, i) => patch.gusts?.[i] ?? v);
        }
        if (key.startsWith('precipitation_') && !key.includes('probability')) {
          hourly[key] = values.map((_, i) => patch.rain?.[i] ?? 0);
        }
      }
      return { ...forecastLyon, hourly };
    }

    function pollenBody(grass: number) {
      const hourly: Record<string, unknown> = { ...airQualityLyon.hourly };
      hourly.grass_pollen = (airQualityLyon.hourly.grass_pollen as number[]).map(() => grass);
      return { ...airQualityLyon, hourly };
    }

    it('une regle d air notifie une fois, avec la source CAMS, sans recharger la prevision des modeles', async () => {
      let forecastCalls = 0;
      server.use(
        http.get(FORECAST_URL, () => {
          forecastCalls += 1;
          return HttpResponse.json(forecastLyon);
        }),
        http.get(AIR_URL, () => HttpResponse.json(pollenBody(150))),
      );
      const airRule: WatchEntry = {
        ...NO_RULES,
        rules: [
          {
            id: 'pollen',
            kind: 'air',
            placeId: ID,
            variable: 'pollen',
            comparator: 'gt',
            threshold: 100,
            enabled: true,
          },
        ],
      };
      const found = await collectWatchNotifications(state([airRule]), NOW);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        key: expect.stringMatching(/^air\|pollen\|2026-09-28T\d\d:00$/) as unknown as string,
        title: 'Lyon · Pollens au-dessus de 100\u00a0grains/m³',
      });
      expect(found[0]?.body).toMatch(/^Dès .*graminées.*prévision CAMS Europe\.$/u);
      // Une regle d'air ne demande pas la prevision des modeles.
      expect(forecastCalls).toBe(0);
      // Deja notifiee, ou sous le seuil, ou service en panne : rien.
      const known = Object.fromEntries(found.map((n) => [n.key, NOW.getTime()]));
      expect(await collectWatchNotifications(state([airRule], known), NOW)).toEqual([]);
      server.use(http.get(AIR_URL, () => HttpResponse.json(pollenBody(30))));
      expect(await collectWatchNotifications(state([airRule]), NOW)).toEqual([]);
      server.use(http.get(AIR_URL, () => new HttpResponse(null, { status: 500 })));
      expect(await collectWatchNotifications(state([airRule]), NOW)).toEqual([]);
    });

    it('des la detection : un vent violent a venir, une fois, avec son modele', async () => {
      server.use(
        http.get(FORECAST_URL, () =>
          HttpResponse.json(forecastWith({ gusts: { 45: 110, 46: 112 } })),
        ),
      );
      const settings = { risks: true, mode: 'instant' } as const;
      const found = await collectWatchNotifications(state([NO_RULES], {}, false, settings), NOW);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        key: `risque|${ID}|strongWind|2026-09-28T21:00`,
        title: 'Lyon · Vent fort, risque fort',
      });
      expect(found[0]?.body).toMatch(/Rafales jusqu’à 112 km\/h\. Selon [A-Z]/);
      const known = Object.fromEntries(found.map((n) => [n.key, NOW.getTime()]));
      expect(
        await collectWatchNotifications(state([NO_RULES], known, false, settings), NOW),
      ).toEqual([]);
    });

    it('des la detection : la pluie qui arrive dans les trois heures, une fois par plage de six heures', async () => {
      server.use(
        http.get(FORECAST_URL, () => HttpResponse.json(forecastWith({ rain: { 41: 2 } }))),
      );
      const settings = { rain: true, mode: 'instant' } as const;
      const found = await collectWatchNotifications(state([NO_RULES], {}, false, settings), NOW);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        key: `pluie|${ID}|2026-09-28|2`,
        title: 'Lyon · Pluie à venir',
      });
      expect(found[0]?.body).toMatch(
        /^Pluie attendue dès lundi 17h selon [A-Z].*2,0.mm sur 24.h\.$/u,
      );
      // Rien quand la pluie est loin.
      server.use(
        http.get(FORECAST_URL, () => HttpResponse.json(forecastWith({ rain: { 50: 2 } }))),
      );
      expect(await collectWatchNotifications(state([NO_RULES], {}, false, settings), NOW)).toEqual(
        [],
      );
    });

    describe('foudre a proximite', () => {
      const CAPABILITIES = 'https://view.eumetsat.int/geoserver/mtg_fd/li_afa/ows';
      const capabilities = () =>
        http.get(CAPABILITIES, () =>
          HttpResponse.text('<Dimension name="time" default="2026-09-28T13:25:00Z">x</Dimension>'),
        );
      const settings = { lightning: true, mode: 'morning' } as const;
      // Un pixel actif au centre de la zone, sur la derniere image seulement.
      const centreMask = (active: boolean) => ({
        width: 64,
        height: 64,
        active: Array.from({ length: 64 * 64 }, (_, i) => active && i === 32 * 64 + 32),
      });

      it('notifie des eclairs vus pres du lieu, meme en mode du matin, une fois par plage', async () => {
        server.use(capabilities());
        const urls: string[] = [];
        const reader = async (url: string) => {
          urls.push(url);
          return centreMask(urls.length === 3);
        };
        const found = await collectWatchNotifications(
          state([NO_RULES], {}, false, settings),
          NOW,
          reader,
        );
        expect(urls).toHaveLength(3);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({
          key: `foudre|${ID}|2026-09-28|5`,
          title: 'Lyon · Éclairs à proximité',
        });
        expect(found[0]?.body).toMatch(
          /^Éclairs vus par le satellite MTG sur place, à 15:25 \(1 zone de 2.km\)\./u,
        );
        const known = Object.fromEntries(found.map((n) => [n.key, NOW.getTime()]));
        expect(
          await collectWatchNotifications(
            state([NO_RULES], known, false, settings),
            NOW,
            async () => centreMask(true),
          ),
        ).toEqual([]);
      });

      it('se tait sans eclair, sans la case cochee, ou quand le satellite ne repond pas', async () => {
        server.use(capabilities());
        expect(
          await collectWatchNotifications(state([NO_RULES], {}, false, settings), NOW, async () =>
            centreMask(false),
          ),
        ).toEqual([]);
        expect(
          await collectWatchNotifications(
            state([NO_RULES], {}, false, { lightning: false }),
            NOW,
            async () => centreMask(true),
          ),
        ).toEqual([]);
        server.use(http.get(CAPABILITIES, () => HttpResponse.error()));
        expect(
          await collectWatchNotifications(state([NO_RULES], {}, false, settings), NOW, async () =>
            centreMask(true),
          ),
        ).toEqual([]);
      });
    });

    it('des la detection : un pollen eleve, une fois par jour, source nommee', async () => {
      server.use(http.get(AIR_URL, () => HttpResponse.json(pollenBody(150))));
      const settings = { pollen: true, mode: 'instant' } as const;
      const found = await collectWatchNotifications(state([NO_RULES], {}, false, settings), NOW);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        key: `pollen|${ID}|2026-09-28`,
        title: 'Lyon · Pollens élevés',
      });
      expect(found[0]?.body).toContain('Graminées (150');
      expect(found[0]?.body).toContain('CAMS Europe');
      // Niveau modere, ou service en panne : rien.
      server.use(http.get(AIR_URL, () => HttpResponse.json(pollenBody(30))));
      expect(await collectWatchNotifications(state([NO_RULES], {}, false, settings), NOW)).toEqual(
        [],
      );
      server.use(http.get(AIR_URL, () => new HttpResponse(null, { status: 500 })));
      expect(await collectWatchNotifications(state([NO_RULES], {}, false, settings), NOW)).toEqual(
        [],
      );
    });

    it('le matin a l heure choisie : une seule notification groupee pour les trois categories', async () => {
      server.use(
        http.get(FORECAST_URL, () =>
          HttpResponse.json(forecastWith({ gusts: { 45: 110 }, rain: { 35: 1.5 } })),
        ),
        http.get(AIR_URL, () => HttpResponse.json(pollenBody(150))),
      );
      const settings = { risks: true, rain: true, pollen: true, mode: 'morning', hour: 8 } as const;
      const found = await collectWatchNotifications(
        state([NO_RULES], {}, false, settings),
        MORNING,
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        key: `resume|2026-09-28|${ID}`,
        title: 'Lyon · Résumé du matin',
      });
      const body = found[0]?.body ?? '';
      expect(body).toContain('Vent fort, risque fort');
      expect(body).toMatch(/Pluie attendue dès lundi 11h/u);
      expect(body).toContain('Pollens élevés');
    });

    it('le matin : rien avant l heure choisie ni apres la plage, et aucune requete inutile', async () => {
      let calls = 0;
      server.use(
        http.get(FORECAST_URL, () => {
          calls += 1;
          return HttpResponse.json(forecastLyon);
        }),
        http.get(AIR_URL, () => {
          calls += 1;
          return HttpResponse.json(airQualityLyon);
        }),
      );
      const settings = { risks: true, rain: true, pollen: true, mode: 'morning' } as const;
      // 9 h 12 avant l'heure choisie (10 h), puis 15 h 27 apres la plage 7 h a 13 h.
      expect(
        await collectWatchNotifications(
          state([NO_RULES], {}, false, { ...settings, hour: 10 }),
          MORNING,
        ),
      ).toEqual([]);
      expect(await collectWatchNotifications(state([NO_RULES], {}, false, settings), NOW)).toEqual(
        [],
      );
      expect(calls).toBe(0);
    });

    it('mode immediat : le resume du matin reste groupe, sans la pluie ni les pollens', async () => {
      server.use(
        http.get(FORECAST_URL, () => HttpResponse.json(forecastWith({ rain: { 35: 1.5 } }))),
        http.get(AIR_URL, () => HttpResponse.json(pollenBody(150))),
      );
      const settings = { rain: true, pollen: true, mode: 'instant', hour: 7 } as const;
      const found = await collectWatchNotifications(state([NO_RULES], {}, true, settings), MORNING);
      const keys = found.map((n) => n.key).sort();
      expect(keys).toEqual([
        `pluie|${ID}|2026-09-28|1`,
        `pollen|${ID}|2026-09-28`,
        `resume|2026-09-28|${ID}`,
      ]);
      const morning = found.find((n) => n.key.startsWith('resume'));
      expect(morning?.body).not.toContain('Pollens');
      expect(morning?.body).not.toContain('Pluie attendue');
    });

    it('se limite aux trois premiers lieux', async () => {
      server.use(
        http.get(FORECAST_URL, () => HttpResponse.json(forecastWith({ rain: { 41: 2 } }))),
      );
      const places = ['a', 'b', 'c', 'd'].map((id) => ({
        ...NO_RULES,
        place: { ...NO_RULES.place, id, name: id },
      }));
      const found = await collectWatchNotifications(
        state(places, {}, false, { rain: true, mode: 'instant' }),
        NOW,
      );
      expect(found).toHaveLength(3);
    });
  });
});

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import type { Station, StationMatch } from '../../domain/stations';
import {
  buildPreviousRunsUrl,
  buildReanalysisUrl,
  buildVerifications,
  chooseReferences,
  fetchVerifications,
  MIN_STATION_COVERAGE,
  reanalysisSeries,
  REANALYSIS_DELAY_DAYS,
  VERIFICATION_LEAD_DAYS,
  VERIFICATION_WINDOW_DAYS,
  verificationWindow,
} from './verification';

const STATION: Station = {
  id: '07145',
  name: 'Grenoble - St Geoirs',
  latitude: 45.36,
  longitude: 5.33,
  elevation: 384,
};

const STATION_MATCH: StationMatch = { station: STATION, distanceKm: 12.4, elevationDelta: -84 };

describe('verificationWindow', () => {
  it('place endDate delayDays avant now et startDate 29 jours plus tot', () => {
    const now = new Date('2026-09-28T12:00:00Z');
    const window = verificationWindow(now, 1);
    expect(window.endDate).toBe('2026-09-27');
    expect(window.startDate).toBe('2026-08-29');
  });

  it('date la fenetre en heure de Paris, comme le parametre timezone de la requete', () => {
    // 00h30 a Paris le 29 : encore le 28 en UTC.
    const window = verificationWindow(new Date('2026-09-28T22:30:00Z'), 0);
    expect(window.endDate).toBe('2026-09-29');
    expect(window.startDate).toBe('2026-08-31');
  });

  it('applique le retard ERA5', () => {
    const now = new Date('2026-09-28T12:00:00Z');
    const window = verificationWindow(now, REANALYSIS_DELAY_DAYS);
    expect(window.endDate).toBe('2026-09-22');
  });

  it('couvre exactement VERIFICATION_WINDOW_DAYS jours', () => {
    const now = new Date('2026-09-28T12:00:00Z');
    const window = verificationWindow(now, 0);
    const days =
      (Date.parse(`${window.endDate}T00:00:00Z`) - Date.parse(`${window.startDate}T00:00:00Z`)) /
      86_400_000;
    expect(days).toBe(VERIFICATION_WINDOW_DAYS - 1);
  });
});

describe('buildPreviousRunsUrl', () => {
  it('liste toutes les echeances pour chaque variable et suffixe le modele demande', () => {
    const url = new URL(
      buildPreviousRunsUrl({
        latitude: 45.36,
        longitude: 5.33,
        models: ['ecmwf'],
        window: { startDate: '2026-08-29', endDate: '2026-09-27' },
      }),
    );
    expect(url.origin + url.pathname).toBe('https://previous-runs-api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('models')).toBe('ecmwf_ifs025');
    expect(url.searchParams.get('hourly')).toBe(
      [
        'temperature_2m_previous_day1',
        'temperature_2m_previous_day2',
        'temperature_2m_previous_day3',
        'temperature_2m_previous_day5',
        'temperature_2m_previous_day7',
        'precipitation_previous_day1',
        'precipitation_previous_day2',
        'precipitation_previous_day3',
        'precipitation_previous_day5',
        'precipitation_previous_day7',
        'wind_speed_10m_previous_day1',
        'wind_speed_10m_previous_day2',
        'wind_speed_10m_previous_day3',
        'wind_speed_10m_previous_day5',
        'wind_speed_10m_previous_day7',
      ].join(','),
    );
    expect(url.searchParams.get('start_date')).toBe('2026-08-29');
    expect(url.searchParams.get('end_date')).toBe('2026-09-27');
  });

  it('accepte plusieurs modeles', () => {
    const url = new URL(
      buildPreviousRunsUrl({
        latitude: 0,
        longitude: 0,
        models: ['arome', 'gfs'],
        window: { startDate: '2026-08-29', endDate: '2026-09-27' },
      }),
    );
    expect(url.searchParams.get('models')).toBe('meteofrance_arome_france_hd,gfs_seamless');
  });
});

describe('altitude de verification', () => {
  it("transmet l'altitude de la station aux previsions passees et a la reanalyse", () => {
    const window = { startDate: '2026-08-29', endDate: '2026-09-27' };
    const previous = new URL(
      buildPreviousRunsUrl({
        latitude: 45.7,
        longitude: 4.9,
        elevation: 200,
        models: ['arome'],
        window,
      }),
    );
    const reanalysis = new URL(
      buildReanalysisUrl({ latitude: 45.7, longitude: 4.9, elevation: 200, window }),
    );
    expect(previous.searchParams.get('elevation')).toBe('200');
    expect(reanalysis.searchParams.get('elevation')).toBe('200');
  });

  it("n'invente pas d'altitude quand elle est inconnue", () => {
    const window = { startDate: '2026-08-29', endDate: '2026-09-27' };
    expect(
      new URL(
        buildPreviousRunsUrl({
          latitude: 45.7,
          longitude: 4.9,
          elevation: null,
          models: ['arome'],
          window,
        }),
      ).searchParams.has('elevation'),
    ).toBe(false);
    expect(
      new URL(buildReanalysisUrl({ latitude: 45.7, longitude: 4.9, window })).searchParams.has(
        'elevation',
      ),
    ).toBe(false);
  });
});

describe('buildReanalysisUrl', () => {
  it('construit une URL archive-api avec les trois variables de base', () => {
    const url = new URL(
      buildReanalysisUrl({
        latitude: 45.36,
        longitude: 5.33,
        window: { startDate: '2026-08-29', endDate: '2026-09-27' },
      }),
    );
    expect(url.origin + url.pathname).toBe('https://archive-api.open-meteo.com/v1/archive');
    expect(url.searchParams.get('hourly')).toBe('temperature_2m,precipitation,wind_speed_10m');
    expect(url.searchParams.get('start_date')).toBe('2026-08-29');
    expect(url.searchParams.get('end_date')).toBe('2026-09-27');
  });
});

describe('reanalysisSeries', () => {
  it('retourne null quand hourly ou time est absent', () => {
    expect(reanalysisSeries({})).toBeNull();
    expect(reanalysisSeries({ hourly: { temperature_2m: [1] } })).toBeNull();
  });

  it('indexe chaque variable par heure locale en ignorant les null', () => {
    const series = reanalysisSeries({
      hourly: {
        time: ['2026-09-01T00:00', '2026-09-01T01:00'],
        temperature_2m: [12, null],
        precipitation: [0, 0.4],
      },
    });
    expect(series).not.toBeNull();
    expect(series?.temperature.get('2026-09-01T00:00')).toBe(12);
    expect(series?.temperature.has('2026-09-01T01:00')).toBe(false);
    expect(series?.precipitation.get('2026-09-01T01:00')).toBe(0.4);
  });

  it('laisse une variable vide quand sa cle est absente du payload', () => {
    const series = reanalysisSeries({
      hourly: { time: ['2026-09-01T00:00'], temperature_2m: [12] },
    });
    expect(series?.wind.size).toBe(0);
  });
});

describe('chooseReferences', () => {
  const stationWindow = { startDate: '2026-08-29', endDate: '2026-09-27' };
  const reanalysisWindow = { startDate: '2026-08-23', endDate: '2026-09-22' };
  const expectedHours = VERIFICATION_WINDOW_DAYS * 24;
  const threshold = Math.ceil(expectedHours * MIN_STATION_COVERAGE);

  function seriesOfSize(count: number): ReadonlyMap<string, number> {
    const map = new Map<string, number>();
    for (let i = 0; i < count; i += 1) {
      map.set(`2026-08-29T00:${String(i).padStart(2, '0')}`, 1);
    }
    return map;
  }

  it('retient la station quand sa couverture atteint exactement le seuil', () => {
    const references = chooseReferences({
      station: STATION_MATCH,
      stationSeries: {
        temperature: seriesOfSize(threshold),
        precipitation: new Map(),
        wind: new Map(),
      },
      stationWindow,
      reanalysisWindow,
    });
    const temperature = references.find((r) => r.variable === 'temperature');
    expect(temperature?.provenance).toBe('observed');
    expect(temperature?.window).toEqual(stationWindow);
    expect(temperature?.station).toEqual(STATION_MATCH);
  });

  it("bascule sur l'estimation quand la couverture est juste sous le seuil", () => {
    const references = chooseReferences({
      station: STATION_MATCH,
      stationSeries: {
        temperature: seriesOfSize(threshold - 1),
        precipitation: new Map(),
        wind: new Map(),
      },
      stationWindow,
      reanalysisWindow,
    });
    const temperature = references.find((r) => r.variable === 'temperature');
    expect(temperature?.provenance).toBe('estimated');
    expect(temperature?.window).toEqual(reanalysisWindow);
    expect(temperature?.station).toBeNull();
  });

  it('reste sur estimated pour toutes les variables sans station', () => {
    const references = chooseReferences({
      station: null,
      stationSeries: null,
      stationWindow,
      reanalysisWindow,
    });
    expect(references.every((r) => r.provenance === 'estimated')).toBe(true);
  });

  it('choisit variable par variable, independamment les unes des autres', () => {
    const references = chooseReferences({
      station: STATION_MATCH,
      stationSeries: {
        temperature: seriesOfSize(threshold),
        precipitation: seriesOfSize(threshold - 1),
        wind: new Map(),
      },
      stationWindow,
      reanalysisWindow,
    });
    expect(references.find((r) => r.variable === 'temperature')?.provenance).toBe('observed');
    expect(references.find((r) => r.variable === 'precipitation')?.provenance).toBe('estimated');
    expect(references.find((r) => r.variable === 'wind')?.provenance).toBe('estimated');
  });
});

describe('buildVerifications', () => {
  const window = { startDate: '2026-09-01', endDate: '2026-09-30' };

  it('echoue en malformed si le bloc horaire est absent', () => {
    const result = buildVerifications({
      models: ['arome'],
      previousRuns: {},
      references: [],
      truth: { observed: null, estimated: null, forecast: null },
    });
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'malformed', detail: 'verification sans bloc horaire' },
    });
  });

  it('ignore une reference sans verite disponible pour sa provenance', () => {
    const result = buildVerifications({
      models: ['arome'],
      previousRuns: { hourly: { time: ['2026-09-15T10:00'] } },
      references: [{ variable: 'temperature', provenance: 'observed', window, station: null }],
      truth: { observed: null, estimated: null, forecast: null },
    });
    expect(result).toEqual({ ok: true, value: [] });
  });

  it('ignore une echeance entierement null (modele non couvrant)', () => {
    const result = buildVerifications({
      models: ['arome'],
      previousRuns: {
        hourly: {
          time: ['2026-09-15T10:00'],
          temperature_2m_previous_day1: [null],
        },
      },
      references: [{ variable: 'temperature', provenance: 'observed', window, station: null }],
      truth: {
        observed: { temperature: new Map(), precipitation: new Map(), wind: new Map() },
        estimated: null,
        forecast: null,
      },
    });
    expect(result).toEqual({ ok: true, value: [] });
  });

  it('apparie les paires par heure locale, filtre hors fenetre, cle non suffixee pour un seul modele', () => {
    const truth = {
      temperature: new Map([
        ['2026-09-15T10:00', 18],
        ['2026-09-15T11:00', 19],
      ]),
      precipitation: new Map(),
      wind: new Map(),
    };
    const result = buildVerifications({
      models: ['arome'],
      previousRuns: {
        hourly: {
          // Le troisieme point est hors fenetre (octobre) : exclu de l'appariement.
          time: ['2026-09-15T10:00', '2026-09-15T11:00', '2026-10-01T00:00'],
          temperature_2m_previous_day1: [18.4, 18.9, 5],
        },
      },
      references: [{ variable: 'temperature', provenance: 'observed', window, station: null }],
      truth: { observed: truth, estimated: null, forecast: null },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    const verification = result.value[0];
    expect(verification?.model).toBe('arome');
    expect(verification?.variable).toBe('temperature');
    expect(verification?.leadDays).toBe(1);
    expect(verification?.reference).toBe('observed');
    expect(verification?.sampleCount).toBe(2);
  });

  it('suffixe la cle par modele quand plusieurs modeles sont demandes', () => {
    const truth = {
      temperature: new Map([['2026-09-15T10:00', 18]]),
      precipitation: new Map(),
      wind: new Map(),
    };
    const result = buildVerifications({
      models: ['arome', 'gfs'],
      previousRuns: {
        hourly: {
          time: ['2026-09-15T10:00'],
          temperature_2m_previous_day1_meteofrance_arome_france_hd: [18],
          temperature_2m_previous_day1_gfs_seamless: [17],
        },
      },
      references: [{ variable: 'temperature', provenance: 'observed', window, station: null }],
      truth: { observed: truth, estimated: null, forecast: null },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const models = result.value.map((v) => v.model).sort();
    expect(models).toEqual(['arome', 'gfs']);
  });
});

const PLACE = { latitude: 45.4936, longitude: 5.4708 };
const NOW = new Date('2026-09-28T12:00:00Z');

function stationCsvWithHours(count: number): string {
  const header =
    'year,month,day,hour,temp,temp_source,rhum,rhum_source,prcp,prcp_source,wdir,wdir_source,wspd,wspd_source,wpgt,wpgt_source,pres,pres_source,tsun,tsun_source,cldc,cldc_source,coco,coco_source';
  const rows: string[] = [];
  const start = Date.UTC(2026, 8, 26, 23); // se termine juste avant `now`, dans la fenetre station
  for (let i = 0; i < count; i += 1) {
    const d = new Date(start - i * 60 * 60 * 1000);
    rows.push(
      `${d.getUTCFullYear()},${d.getUTCMonth() + 1},${d.getUTCDate()},${d.getUTCHours()},12.5,metar,,,,,,,,,,,,,,,,,,`,
    );
  }
  return [header, ...rows].join('\n');
}

function reanalysisBody(): Record<string, unknown> {
  return {
    hourly: {
      time: ['2026-09-15T10:00', '2026-09-15T11:00'],
      temperature_2m: [15, 16],
      precipitation: [0, 0],
      wind_speed_10m: [10, 12],
    },
  };
}

function previousRunsBody(): Record<string, unknown> {
  return {
    hourly: {
      time: ['2026-09-15T10:00', '2026-09-15T11:00'],
      temperature_2m_previous_day1: [15.2, 16.1],
      precipitation_previous_day1: [0, 0],
      wind_speed_10m_previous_day1: [9.8, 11.5],
    },
  };
}

/**
 * Compresse un texte en gzip via l'API Web standard (pas de zlib Node, hors
 * de la surface typee de ce projet, cf. tsconfig.app.json `types`).
 */
async function gzip(text: string): Promise<Uint8Array> {
  const body = new Response(text).body;
  if (body === null) {
    return new Uint8Array();
  }
  const compressed = body.pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

describe('fetchVerifications', () => {
  it("propage l'echec sans requeter davantage quand previous-runs echoue", async () => {
    server.use(
      http.get(
        'https://previous-runs-api.open-meteo.com/v1/forecast',
        () => new HttpResponse(null, { status: 500 }),
      ),
      http.get('https://archive-api.open-meteo.com/v1/archive', () =>
        HttpResponse.json(reanalysisBody()),
      ),
    );
    const result = await fetchVerifications({
      ...PLACE,
      models: ['arome'],
      station: null,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('server_error');
    }
  });

  it("propage l'echec ERA5 quand il n'y a ni station ni reanalyse exploitable", async () => {
    server.use(
      http.get('https://previous-runs-api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json(previousRunsBody()),
      ),
      http.get(
        'https://archive-api.open-meteo.com/v1/archive',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const result = await fetchVerifications({
      ...PLACE,
      models: ['arome'],
      station: null,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('server_error');
    }
  });

  it('echoue en malformed quand la reanalyse repond ok mais sans donnees exploitables', async () => {
    server.use(
      http.get('https://previous-runs-api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json(previousRunsBody()),
      ),
      http.get('https://archive-api.open-meteo.com/v1/archive', () => HttpResponse.json({})),
    );
    const result = await fetchVerifications({
      ...PLACE,
      models: ['arome'],
      station: null,
      now: NOW,
    });
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'malformed', detail: 'aucune reference exploitable' },
    });
  });

  it("se replie sur ERA5 quand aucune station n'est fournie, au point du lieu", async () => {
    const requestedUrls: string[] = [];
    server.use(
      http.get('https://previous-runs-api.open-meteo.com/v1/forecast', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json(previousRunsBody());
      }),
      http.get('https://archive-api.open-meteo.com/v1/archive', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json(reanalysisBody());
      }),
    );
    const result = await fetchVerifications({
      ...PLACE,
      models: ['arome'],
      station: null,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.references.every((r) => r.provenance === 'estimated')).toBe(true);
    expect(result.value.references.every((r) => r.station === null)).toBe(true);
    for (const url of requestedUrls) {
      expect(new URL(url).searchParams.get('latitude')).toBe(String(PLACE.latitude));
      expect(new URL(url).searchParams.get('longitude')).toBe(String(PLACE.longitude));
      expect(new URL(url).searchParams.has('elevation')).toBe(false);
    }
  });

  it('se replie sur ERA5 au point de la station quand ses observations sont inaccessibles', async () => {
    const requestedUrls: string[] = [];
    server.use(
      http.get('https://previous-runs-api.open-meteo.com/v1/forecast', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json(previousRunsBody());
      }),
      http.get('https://archive-api.open-meteo.com/v1/archive', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json(reanalysisBody());
      }),
      http.get(
        `https://data.meteostat.net/hourly/2026/${STATION.id}.csv.gz`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const result = await fetchVerifications({
      ...PLACE,
      models: ['arome'],
      station: STATION_MATCH,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.references.every((r) => r.provenance === 'estimated')).toBe(true);
    for (const url of requestedUrls) {
      expect(new URL(url).searchParams.get('latitude')).toBe(String(STATION.latitude));
      expect(new URL(url).searchParams.get('longitude')).toBe(String(STATION.longitude));
      // Station a station : a l'altitude de la station aussi.
      expect(new URL(url).searchParams.get('elevation')).toBe(String(STATION.elevation));
    }
  });

  it('verifie au point de la station et marque la temperature observed quand sa couverture suffit', async () => {
    const threshold = Math.ceil(VERIFICATION_WINDOW_DAYS * 24 * MIN_STATION_COVERAGE);
    server.use(
      http.get('https://previous-runs-api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json(previousRunsBody()),
      ),
      http.get('https://archive-api.open-meteo.com/v1/archive', () =>
        HttpResponse.json(reanalysisBody()),
      ),
      http.get(`https://data.meteostat.net/hourly/2026/${STATION.id}.csv.gz`, async () => {
        return new HttpResponse(await gzip(stationCsvWithHours(threshold)));
      }),
    );
    const result = await fetchVerifications({
      ...PLACE,
      models: ['arome'],
      station: STATION_MATCH,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const temperature = result.value.references.find((r) => r.variable === 'temperature');
    expect(temperature?.provenance).toBe('observed');
    expect(temperature?.station).toEqual(STATION_MATCH);
    // Derniere heure mesuree par la station, en heure de Paris.
    expect(result.value.observedUntil).toBe('2026-09-27T01:00');
    expect(result.value.verifications.length).toBeGreaterThan(0);
    expect(
      result.value.verifications.some(
        (v) => v.variable === 'temperature' && v.reference === 'observed',
      ),
    ).toBe(true);
  });
});

describe('fetchVerifications, fraicheur horaire', () => {
  it('inclut les heures du jour : la fenetre de la station se termine aujourd hui, pas hier', async () => {
    const ends: string[] = [];
    server.use(
      http.get('https://previous-runs-api.open-meteo.com/v1/forecast', ({ request }) => {
        ends.push(new URL(request.url).searchParams.get('end_date') ?? '');
        return HttpResponse.json(previousRunsBody());
      }),
      http.get('https://archive-api.open-meteo.com/v1/archive', () =>
        HttpResponse.json(reanalysisBody()),
      ),
      http.get(`https://data.meteostat.net/hourly/2026/${STATION.id}.csv.gz`, async () => {
        return new HttpResponse(await gzip(stationCsvWithHours(0)));
      }),
    );
    await fetchVerifications({
      ...PLACE,
      models: ['arome'],
      station: STATION_MATCH,
      now: NOW,
    });
    // Les heures d'aujourd'hui entrent des que la station les a publiees.
    expect(ends).toEqual(['2026-09-28']);
  });
});

describe('fetchVerifications, derniere mesure', () => {
  it('ne dit aucune heure mesuree quand la reference est la reanalyse', async () => {
    server.use(
      http.get('https://previous-runs-api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json(previousRunsBody()),
      ),
      http.get('https://archive-api.open-meteo.com/v1/archive', () =>
        HttpResponse.json(reanalysisBody()),
      ),
    );
    const result = await fetchVerifications({
      ...PLACE,
      models: ['arome'],
      station: null,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observedUntil).toBeNull();
  });
});

describe('VERIFICATION_LEAD_DAYS', () => {
  it('couvre J-1, J-2, J-3, J-5 et J-7', () => {
    expect(VERIFICATION_LEAD_DAYS).toEqual([1, 2, 3, 5, 7]);
  });
});

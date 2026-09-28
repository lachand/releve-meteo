import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw';
import {
  buildStationYearUrl,
  fetchStationObservations,
  fetchStationYear,
  mergeObservations,
  OBSERVATION_SOURCES,
  parseMeteostatCsv,
  parseStationRecords,
  STATION_DOWNLOAD_SHARE_MS,
} from './meteostat';

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

const HEADER = [
  'year',
  'month',
  'day',
  'hour',
  'temp',
  'temp_source',
  'rhum',
  'rhum_source',
  'prcp',
  'prcp_source',
  'wdir',
  'wdir_source',
  'wspd',
  'wspd_source',
  'wpgt',
  'wpgt_source',
  'pres',
  'pres_source',
  'tsun',
  'tsun_source',
  'cldc',
  'cldc_source',
  'coco',
  'coco_source',
] as const;

/** Construit une ligne CSV Meteostat complete a partir des seules colonnes fournies. */
function row(values: Partial<Record<(typeof HEADER)[number], string>>): string {
  return HEADER.map((column) => values[column] ?? '').join(',');
}

function csv(rows: readonly string[]): string {
  return [HEADER.join(','), ...rows].join('\n');
}

describe('buildStationYearUrl', () => {
  it('construit une URL vers le CSV gzip annuel de la station', () => {
    expect(buildStationYearUrl('07145', 2026)).toBe(
      'https://data.meteostat.net/hourly/2026/07145.csv.gz',
    );
  });

  it('encode un identifiant de station contenant des caracteres speciaux', () => {
    expect(buildStationYearUrl('AB/12', 2026)).toBe(
      'https://data.meteostat.net/hourly/2026/AB%2F12.csv.gz',
    );
  });
});

describe('parseMeteostatCsv', () => {
  it('retient une mesure metar et rejette une prevision dwd_mosmix', () => {
    const content = csv([
      row({ year: '2026', month: '1', day: '15', hour: '10', temp: '5.2', temp_source: 'metar' }),
      row({
        year: '2026',
        month: '1',
        day: '15',
        hour: '11',
        temp: '99',
        temp_source: 'dwd_mosmix',
      }),
    ]);
    const series = parseMeteostatCsv(content);
    expect(series.temperature.get('2026-01-15T11:00')).toBe(5.2);
    expect(series.temperature.has('2026-01-15T12:00')).toBe(false);
  });

  it('rejette une prevision metno_forecast', () => {
    const content = csv([
      row({
        year: '2026',
        month: '1',
        day: '15',
        hour: '10',
        prcp: '1.4',
        prcp_source: 'metno_forecast',
      }),
    ]);
    const series = parseMeteostatCsv(content);
    expect(series.precipitation.size).toBe(0);
  });

  it('accepte dwd_poi comme source d observation', () => {
    const content = csv([
      row({
        year: '2026',
        month: '1',
        day: '15',
        hour: '10',
        wspd: '12.3',
        wspd_source: 'dwd_poi',
      }),
    ]);
    const series = parseMeteostatCsv(content);
    expect(series.wind.get('2026-01-15T11:00')).toBe(12.3);
  });

  it('convertit UTC vers Europe/Paris local, offset hiver (+1h)', () => {
    const content = csv([
      row({ year: '2026', month: '1', day: '15', hour: '10', temp: '3', temp_source: 'metar' }),
    ]);
    const series = parseMeteostatCsv(content);
    expect([...series.temperature.keys()]).toEqual(['2026-01-15T11:00']);
  });

  it('convertit UTC vers Europe/Paris local, offset ete (+2h)', () => {
    const content = csv([
      row({ year: '2026', month: '7', day: '15', hour: '10', temp: '22', temp_source: 'metar' }),
    ]);
    const series = parseMeteostatCsv(content);
    expect([...series.temperature.keys()]).toEqual(['2026-07-15T12:00']);
  });

  it('ignore une ligne dont la valeur est vide', () => {
    const content = csv([
      row({ year: '2026', month: '1', day: '15', hour: '10', temp: '', temp_source: 'metar' }),
    ]);
    const series = parseMeteostatCsv(content);
    expect(series.temperature.size).toBe(0);
  });

  it('ignore une ligne dont la source est inconnue', () => {
    const content = csv([
      row({ year: '2026', month: '1', day: '15', hour: '10', temp: '3', temp_source: 'inconnue' }),
    ]);
    const series = parseMeteostatCsv(content);
    expect(series.temperature.size).toBe(0);
  });

  it('ignore une ligne dont la date est illisible', () => {
    const content = csv([
      row({ year: 'x', month: '1', day: '15', hour: '10', temp: '3', temp_source: 'metar' }),
    ]);
    const series = parseMeteostatCsv(content);
    expect(series.temperature.size).toBe(0);
  });

  it('ignore les lignes vides', () => {
    const content = `${csv([row({ year: '2026', month: '1', day: '15', hour: '10', temp: '3', temp_source: 'metar' })])}\n\n`;
    const series = parseMeteostatCsv(content);
    expect(series.temperature.size).toBe(1);
  });

  it('retourne des series vides quand les colonnes de date sont absentes du header', () => {
    const series = parseMeteostatCsv('temp,temp_source\n5.2,metar');
    expect(series.temperature.size).toBe(0);
    expect(series.precipitation.size).toBe(0);
    expect(series.wind.size).toBe(0);
  });

  it('OBSERVATION_SOURCES contient metar et dwd_poi, pas les previsions', () => {
    expect(OBSERVATION_SOURCES.has('metar')).toBe(true);
    expect(OBSERVATION_SOURCES.has('dwd_poi')).toBe(true);
    expect(OBSERVATION_SOURCES.has('dwd_mosmix')).toBe(false);
    expect(OBSERVATION_SOURCES.has('metno_forecast')).toBe(false);
  });
});

describe('mergeObservations', () => {
  it('fusionne les entrees de plusieurs annees sur chaque variable', () => {
    const partA = parseMeteostatCsv(
      csv([
        row({ year: '2025', month: '12', day: '31', hour: '23', temp: '2', temp_source: 'metar' }),
      ]),
    );
    const partB = parseMeteostatCsv(
      csv([
        row({ year: '2026', month: '1', day: '1', hour: '0', temp: '1', temp_source: 'metar' }),
      ]),
    );
    const merged = mergeObservations([partA, partB]);
    expect(merged.temperature.size).toBe(2);
    expect(merged.temperature.get('2026-01-01T00:00')).toBe(2); // 23h UTC -> 00h locale hiver
    expect(merged.temperature.get('2026-01-01T01:00')).toBe(1);
  });

  it('fusionne une liste vide en series vides', () => {
    const merged = mergeObservations([]);
    expect(merged.temperature.size).toBe(0);
    expect(merged.precipitation.size).toBe(0);
    expect(merged.wind.size).toBe(0);
  });
});

describe('fetchStationObservations', () => {
  it('recupere et fusionne les CSV gzip de chaque annee demandee', async () => {
    server.use(
      http.get('https://data.meteostat.net/hourly/2025/07145.csv.gz', async () => {
        const body = csv([
          row({
            year: '2025',
            month: '12',
            day: '31',
            hour: '23',
            temp: '2',
            temp_source: 'metar',
          }),
        ]);
        return new HttpResponse(await gzip(body));
      }),
      http.get('https://data.meteostat.net/hourly/2026/07145.csv.gz', async () => {
        const body = csv([
          row({ year: '2026', month: '1', day: '1', hour: '0', temp: '1', temp_source: 'metar' }),
        ]);
        return new HttpResponse(await gzip(body));
      }),
    );
    const result = await fetchStationObservations({ stationId: '07145', years: [2025, 2026] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.temperature.size).toBe(2);
  });

  it('renvoie l echec sans requeter les annees suivantes', async () => {
    let secondYearCalls = 0;
    server.use(
      http.get(
        'https://data.meteostat.net/hourly/2025/07145.csv.gz',
        () => new HttpResponse(null, { status: 500 }),
      ),
      http.get('https://data.meteostat.net/hourly/2026/07145.csv.gz', async () => {
        secondYearCalls += 1;
        return new HttpResponse(await gzip(csv([])));
      }),
    );
    const result = await fetchStationObservations({
      stationId: '07145',
      years: [2025, 2026],
    });
    expect(result.ok).toBe(false);
    expect(secondYearCalls).toBe(0);
  });
});

describe('parseStationRecords', () => {
  const since = Date.UTC(2026, 8, 28, 0);

  it('garde chaque grandeur observee avec sa provenance, en heure locale', () => {
    const content = csv([
      row({
        year: '2026',
        month: '9',
        day: '28',
        hour: '10',
        temp: '26.0',
        temp_source: 'metar',
        rhum: '37',
        rhum_source: 'metar',
        prcp: '0.0',
        prcp_source: 'dwd_mosmix',
        wdir: '170',
        wdir_source: 'metar',
        wspd: '15.0',
        wspd_source: 'metar',
        wpgt: '46.3',
        wpgt_source: 'dwd_mosmix',
        pres: '1021.0',
        pres_source: 'metar',
      }),
    ]);
    expect(parseStationRecords(content, since)).toEqual([
      {
        time: '2026-09-28T12:00',
        temperature: { value: 26, provenance: 'observed' },
        humidity: { value: 37, provenance: 'observed' },
        // Pluie et rafale prevues par MOSMIX : jamais presentees comme mesurees.
        precipitation: { value: null, provenance: 'observed' },
        windSpeed: { value: 15, provenance: 'observed' },
        windDirection: { value: 170, provenance: 'observed' },
        windGust: { value: null, provenance: 'observed' },
        pressure: { value: 1021, provenance: 'observed' },
      },
    ]);
  });

  it('ignore les heures anterieures a la borne et les heures sans aucune mesure', () => {
    const content = csv([
      row({ year: '2026', month: '9', day: '27', hour: '23', temp: '18', temp_source: 'metar' }),
      row({ year: '2026', month: '9', day: '28', hour: '0', temp: '17', temp_source: 'metar' }),
      row({
        year: '2026',
        month: '9',
        day: '28',
        hour: '1',
        temp: '17',
        temp_source: 'dwd_mosmix',
      }),
    ]);
    const records = parseStationRecords(content, since);
    expect(records.map((record) => record.time)).toEqual(['2026-09-28T02:00']);
  });

  it('renvoie une liste vide sans colonnes de date', () => {
    expect(parseStationRecords('temp,temp_source\n5.2,metar', since)).toEqual([]);
  });
});

describe('fetchStationYear', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('partage un meme telechargement entre deux lecteurs', async () => {
    let calls = 0;
    server.use(
      http.get('https://data.meteostat.net/hourly/2026/07480.csv.gz', async () => {
        calls += 1;
        return new HttpResponse(await gzip(csv([])));
      }),
    );
    const [first, second] = await Promise.all([
      fetchStationYear('07480', 2026),
      fetchStationYear('07480', 2026),
    ]);
    await fetchStationYear('07480', 2026);
    expect(first.ok && second.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it('telecharge a nouveau passe la duree de partage', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T13:00:00Z'));
    let calls = 0;
    server.use(
      http.get('https://data.meteostat.net/hourly/2026/07480.csv.gz', async () => {
        calls += 1;
        return new HttpResponse(await gzip(csv([])));
      }),
    );
    await fetchStationYear('07480', 2026);
    vi.setSystemTime(new Date(Date.now() + STATION_DOWNLOAD_SHARE_MS));
    await fetchStationYear('07480', 2026);
    expect(calls).toBe(2);
  });

  it('ne partage jamais un echec', async () => {
    let calls = 0;
    server.use(
      http.get('https://data.meteostat.net/hourly/2026/07480.csv.gz', () => {
        calls += 1;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    const first = await fetchStationYear('07480', 2026);
    const second = await fetchStationYear('07480', 2026);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect(calls).toBe(2);
  });
});

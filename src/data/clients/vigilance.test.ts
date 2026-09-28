import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import girondeRaw from '../../../tests/fixtures/live/vigilance-gironde.json?raw';
import rhoneRaw from '../../../tests/fixtures/live/vigilance-rhone.json?raw';
import { buildVigilanceUrl, fetchVigilance, mapVigilance } from './vigilance';

const GIRONDE: unknown = JSON.parse(girondeRaw);
const RHONE: unknown = JSON.parse(rhoneRaw);

describe('buildVigilanceUrl', () => {
  it('demande le departement et son littoral', () => {
    const url = new URL(buildVigilanceUrl('33'));
    expect(url.hostname).toBe('public.opendatasoft.com');
    expect(url.searchParams.get('where')).toBe('domain_id in ("33","3310")');
  });
});

describe('mapVigilance, reponses reelles du 28 septembre 2026', () => {
  it('lit la vigilance jaune orages de la Gironde et son littoral', () => {
    const result = mapVigilance(GIRONDE, '33');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { periods, issuedUtcMs } = result.value;
    expect(issuedUtcMs).toBe(Date.parse('2026-09-28T14:00:00Z'));
    expect(periods.some((p) => p.phenomenon === 'thunderstorm' && p.level === 2)).toBe(true);
    expect(periods.filter((p) => p.coastal).every((p) => p.phenomenon === 'waves')).toBe(true);
  });

  it('lit un Rhone tout vert, sans littoral', () => {
    const result = mapVigilance(RHONE, '69');
    expect(result.ok && result.value.periods.every((p) => p.level === 1 && !p.coastal)).toBe(true);
  });
});

describe('mapVigilance, robustesse', () => {
  const good = {
    domain_id: '69',
    phenomenon_id: 3,
    color_id: 3,
    begin_time: '2026-09-28T14:00:00+00:00',
    end_time: '2026-09-28T22:00:00+00:00',
    product_datetime: '2026-09-28T14:00:00+00:00',
  };

  it('ecarte un enregistrement illisible ou d un autre departement, sans le completer', () => {
    const result = mapVigilance(
      {
        results: [
          good,
          { ...good, color_id: 7 },
          { ...good, phenomenon_id: 42 },
          { ...good, phenomenon_id: '3' },
          { ...good, begin_time: 'hier' },
          { ...good, end_time: null },
          { ...good, product_datetime: 12 },
          { ...good, domain_id: '38' },
        ],
      },
      '69',
    );
    expect(result.ok && result.value.periods).toEqual([
      {
        phenomenon: 'thunderstorm',
        level: 3,
        beginUtcMs: Date.parse('2026-09-28T14:00:00Z'),
        endUtcMs: Date.parse('2026-09-28T22:00:00Z'),
        coastal: false,
      },
    ]);
  });

  it('refuse une reponse sans resultat lisible', () => {
    expect(mapVigilance({ results: [] }, '69').ok).toBe(false);
    expect(mapVigilance({ oops: true }, '69').ok).toBe(false);
    expect(mapVigilance(null, '69').ok).toBe(false);
  });
});

describe('fetchVigilance', () => {
  it('interroge le jeu public et rend le bulletin, ou propage l echec', async () => {
    server.use(
      http.get('https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/*', () =>
        HttpResponse.json(RHONE as Record<string, unknown>),
      ),
    );
    expect((await fetchVigilance('69')).ok).toBe(true);
    server.use(
      http.get(
        'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/*',
        () => new HttpResponse(null, { status: 400 }),
      ),
    );
    expect((await fetchVigilance('69')).ok).toBe(false);
  });
});

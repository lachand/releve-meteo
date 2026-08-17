import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import { buildGeocodingUrl, fetchPlaces } from './geocoding';

describe('buildGeocodingUrl', () => {
  it('inclut le nom recherche, la langue francaise et le filtre pays FR', () => {
    const url = new URL(buildGeocodingUrl({ query: 'Val de Virieu' }));
    expect(url.origin + url.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(url.searchParams.get('name')).toBe('Val de Virieu');
    expect(url.searchParams.get('language')).toBe('fr');
    expect(url.searchParams.get('countryCode')).toBe('FR');
    expect(url.searchParams.get('count')).toBe('10');
  });

  it('reprend le compte demande', () => {
    const url = new URL(buildGeocodingUrl({ query: 'Lyon', count: 3 }));
    expect(url.searchParams.get('count')).toBe('3');
  });
});

describe('fetchPlaces', () => {
  it('convertit les resultats en Place, admin depuis admin2', async () => {
    server.use(
      http.get('https://geocoding-api.open-meteo.com/v1/search', () =>
        HttpResponse.json({
          results: [
            {
              latitude: 45.48404,
              longitude: 5.47586,
              name: 'Virieu',
              elevation: 415,
              admin2: 'Isère',
            },
          ],
        }),
      ),
    );
    const result = await fetchPlaces({ query: 'Virieu' });
    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: '45.4840:5.4759',
          name: 'Virieu',
          latitude: 45.48404,
          longitude: 5.47586,
          elevation: 415,
          admin: 'Isère',
          alias: null,
        },
      ],
    });
  });

  it('retourne admin null quand admin2 est absent', async () => {
    server.use(
      http.get('https://geocoding-api.open-meteo.com/v1/search', () =>
        HttpResponse.json({
          results: [{ latitude: 1, longitude: 1, name: 'Lieu-dit', elevation: 0 }],
        }),
      ),
    );
    const result = await fetchPlaces({ query: 'x' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.admin).toBeNull();
    }
  });

  it('retourne une liste vide sans resultats, sans exception', async () => {
    server.use(
      http.get('https://geocoding-api.open-meteo.com/v1/search', () =>
        HttpResponse.json({ generationtime_ms: 0.1 }),
      ),
    );
    const result = await fetchPlaces({ query: 'inexistant' });
    expect(result).toEqual({ ok: true, value: [] });
  });

  it("propage un HttpResult d'echec", async () => {
    server.use(
      http.get(
        'https://geocoding-api.open-meteo.com/v1/search',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const result = await fetchPlaces({ query: 'x' }, undefined);
    expect(result.ok).toBe(false);
  });
});

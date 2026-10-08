import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import { buildPreviousDayUrl, fetchPreviousDay, mapPreviousDay } from './previousDay';
import type { RawForecastResponse } from './openMeteo';

function raw(hourly: RawForecastResponse['hourly']): RawForecastResponse {
  return {
    latitude: 45.7,
    longitude: 4.8,
    elevation: 173,
    timezone: 'Europe/Paris',
    utc_offset_seconds: 7200,
    hourly,
  };
}

describe('buildPreviousDayUrl', () => {
  it('demande temperature et pluie prevues la veille, par modele, sur 30 jours', () => {
    const url = new URL(
      buildPreviousDayUrl({
        latitude: 45.7485,
        longitude: 4.8467,
        elevation: 173,
        models: ['arome', 'gfs'],
      }),
    );
    expect(url.origin).toBe('https://previous-runs-api.open-meteo.com');
    expect(url.searchParams.get('models')).toBe('meteofrance_arome_france_hd,gfs_seamless');
    expect(url.searchParams.get('hourly')).toBe(
      'temperature_2m_previous_day1,precipitation_previous_day1',
    );
    expect(url.searchParams.get('past_days')).toBe('30');
    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
    expect(url.searchParams.get('elevation')).toBe('173');
  });

  it('n envoie pas d altitude inconnue', () => {
    const url = new URL(buildPreviousDayUrl({ latitude: 1, longitude: 2, models: ['arome'] }));
    expect(url.searchParams.has('elevation')).toBe(false);
  });
});

describe('mapPreviousDay', () => {
  it('range les series par modele, avec le suffixe quand plusieurs modeles sont demandes', () => {
    const result = mapPreviousDay(
      raw({
        time: ['2026-10-03T00:00', '2026-10-03T01:00'],
        temperature_2m_previous_day1_meteofrance_arome_france_hd: [10, 11],
        precipitation_previous_day1_meteofrance_arome_france_hd: [0, 0.2],
        temperature_2m_previous_day1_gfs_seamless: [9, null],
      }),
      ['arome', 'gfs'],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timeline).toEqual(['2026-10-03T00:00', '2026-10-03T01:00']);
      expect(result.value.temperature.arome).toEqual([10, 11]);
      expect(result.value.temperature.gfs).toEqual([9, null]);
      expect(result.value.precipitation.arome).toEqual([0, 0.2]);
      expect(result.value.precipitation.gfs).toBeUndefined();
    }
  });

  it('lit les variables nues pour un seul modele, et ecarte un modele sans valeur', () => {
    const result = mapPreviousDay(
      raw({
        time: ['2026-10-03T00:00'],
        temperature_2m_previous_day1: [10],
        precipitation_previous_day1: [null],
      }),
      ['arome'],
    );
    expect(result.ok && result.value.temperature.arome).toEqual([10]);
    expect(result.ok && result.value.precipitation.arome).toBeUndefined();
  });

  it('refuse une reponse sans bloc horaire', () => {
    const result = mapPreviousDay(raw(undefined), ['arome']);
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'malformed', detail: 'previsions de la veille sans bloc horaire' },
    });
  });
});

describe('fetchPreviousDay', () => {
  it('interroge l API et rend les series', async () => {
    server.use(
      http.get('https://previous-runs-api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json(raw({ time: ['2026-10-03T00:00'], temperature_2m_previous_day1: [10] })),
      ),
    );
    const result = await fetchPreviousDay({ latitude: 45.7, longitude: 4.8, models: ['arome'] });
    expect(result.ok && result.value.temperature.arome).toEqual([10]);
  });

  it('rend l echec reseau tel quel', async () => {
    server.use(
      http.get('https://previous-runs-api.open-meteo.com/v1/forecast', () => HttpResponse.error()),
    );
    const result = await fetchPreviousDay({
      latitude: 45.7,
      longitude: 4.8,
      models: ['arome'],
    });
    expect(result.ok).toBe(false);
  });
});

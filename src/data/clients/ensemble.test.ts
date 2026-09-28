import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import {
  buildEnsembleUrl,
  ENSEMBLE_FORECAST_DAYS,
  ENSEMBLE_MODEL,
  extractMembers,
  fetchEnsemble,
  mapEnsembleResponse,
} from './ensemble';

describe('buildEnsembleUrl', () => {
  it("construit une URL vers l'API d'ensemble avec le seul systeme ECMWF ENS", () => {
    const url = new URL(buildEnsembleUrl(45.4936, 5.4708));
    expect(url.origin + url.pathname).toBe('https://ensemble-api.open-meteo.com/v1/ensemble');
    expect(url.searchParams.get('latitude')).toBe('45.4936');
    expect(url.searchParams.get('longitude')).toBe('5.4708');
    expect(url.searchParams.get('models')).toBe(ENSEMBLE_MODEL);
    expect(url.searchParams.get('hourly')).toBe('temperature_2m,precipitation,wind_gusts_10m');
    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
    expect(url.searchParams.get('forecast_days')).toBe(String(ENSEMBLE_FORECAST_DAYS));
  });
});

describe('extractMembers', () => {
  const length = 3;

  it('inclut le membre de controle (cle nue) et les membres numerotes', () => {
    const hourly = {
      temperature_2m: [10, 11, 12],
      temperature_2m_member01: [10.5, 11.5, 12.5],
      temperature_2m_member50: [9, 10, 11],
    };
    const members = extractMembers(hourly, 'temperature_2m', length);
    expect(members).toHaveLength(3);
    expect(members).toContainEqual([10, 11, 12]);
    expect(members).toContainEqual([10.5, 11.5, 12.5]);
    expect(members).toContainEqual([9, 10, 11]);
  });

  it('exclut les cles qui partagent le prefixe mais sont une autre variable', () => {
    const hourly = {
      temperature_2m: [10, 11, 12],
      temperature_2m_max: [12, 12, 12],
      temperature_2mx: [1, 2, 3],
    };
    const members = extractMembers(hourly, 'temperature_2m', length);
    expect(members).toEqual([[10, 11, 12]]);
  });

  it('exclut une serie dont la longueur ne correspond pas', () => {
    const hourly = {
      temperature_2m: [10, 11, 12],
      temperature_2m_member01: [10, 11], // tronquee
    };
    const members = extractMembers(hourly, 'temperature_2m', length);
    expect(members).toEqual([[10, 11, 12]]);
  });

  it('retourne un tableau vide quand aucune cle ne correspond', () => {
    expect(extractMembers({ precipitation: [0, 0, 0] }, 'temperature_2m', length)).toEqual([]);
  });
});

describe('mapEnsembleResponse', () => {
  it('echoue en malformed si le bloc hourly est absent', () => {
    const result = mapEnsembleResponse({});
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'malformed', detail: "ensemble sans bloc 'hourly'" },
    });
  });

  it('echoue en malformed si time est absent', () => {
    const result = mapEnsembleResponse({ hourly: { temperature_2m: [10] } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('malformed');
  });

  it('echoue en malformed si aucun membre de temperature ne correspond', () => {
    const result = mapEnsembleResponse({
      hourly: { time: ['2026-09-28T00:00'], precipitation_member01: [0] },
    });
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'malformed', detail: 'ensemble sans membre' },
    });
  });

  it('construit EnsembleHourly avec les trois variables sur succes', () => {
    const result = mapEnsembleResponse({
      hourly: {
        time: ['2026-09-28T00:00', '2026-09-28T01:00'],
        temperature_2m: [10, 11],
        temperature_2m_member01: [10.2, 11.2],
        precipitation: [0, 0.1],
        wind_gusts_10m_member01: [20, 22],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.timeline).toEqual(['2026-09-28T00:00', '2026-09-28T01:00']);
    expect(result.value.temperature).toHaveLength(2);
    expect(result.value.precipitation).toHaveLength(1);
    expect(result.value.windGust).toHaveLength(1);
  });
});

describe('fetchEnsemble', () => {
  it('retourne EnsembleHourly mappe sur succes', async () => {
    server.use(
      http.get('https://ensemble-api.open-meteo.com/v1/ensemble', () =>
        HttpResponse.json({
          hourly: {
            time: ['2026-09-28T00:00'],
            temperature_2m: [10],
          },
        }),
      ),
    );
    const result = await fetchEnsemble(45.4936, 5.4708);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.temperature).toEqual([[10]]);
    }
  });

  it("propage l'echec HTTP sans exception", async () => {
    server.use(
      http.get(
        'https://ensemble-api.open-meteo.com/v1/ensemble',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const result = await fetchEnsemble(45.4936, 5.4708);
    expect(result.ok).toBe(false);
  });

  it('propage un echec malformed du mapping sans le masquer', async () => {
    server.use(
      http.get('https://ensemble-api.open-meteo.com/v1/ensemble', () =>
        HttpResponse.json({ hourly: { time: ['2026-09-28T00:00'] } }),
      ),
    );
    const result = await fetchEnsemble(45.4936, 5.4708);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('malformed');
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpResult } from '../clients/http';
import {
  DIAGNOSTIC_SOURCES,
  clearDiagnostics,
  readDiagnostics,
  recordDiagnostic,
  resetDiagnosticsForTests,
} from './diagnostics';

const OK: HttpResult<number> = { ok: true, value: 1 };

beforeEach(() => {
  localStorage.clear();
  resetDiagnosticsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('diagnostics', () => {
  it('ne dit rien d une source jamais lue', () => {
    const all = readDiagnostics();
    expect(Object.keys(all)).toEqual([...DIAGNOSTIC_SOURCES]);
    expect(all.forecast).toEqual({ lastSuccess: null, lastFailure: null });
  });

  it('note la derniere reussite et le dernier echec, chacun a part', () => {
    recordDiagnostic('forecast', OK, 1000);
    recordDiagnostic(
      'forecast',
      { ok: false, failure: { kind: 'server_error', status: 503 } },
      2000,
    );
    recordDiagnostic('forecast', { ok: false, failure: { kind: 'network' } }, 3000);
    recordDiagnostic('station', OK, 4000);
    const all = readDiagnostics();
    expect(all.forecast).toEqual({
      lastSuccess: 1000,
      lastFailure: { at: 3000, kind: 'network', status: null },
    });
    expect(all.station.lastSuccess).toBe(4000);
    // Un echec n'efface pas la derniere reussite, ni l'inverse.
    recordDiagnostic('forecast', OK, 5000);
    expect(readDiagnostics().forecast).toEqual({
      lastSuccess: 5000,
      lastFailure: { at: 3000, kind: 'network', status: null },
    });
  });

  it('garde le code HTTP quand la source en a repondu un', () => {
    recordDiagnostic(
      'airQuality',
      { ok: false, failure: { kind: 'server_error', status: 502 } },
      7,
    );
    expect(readDiagnostics().airQuality.lastFailure).toEqual({
      at: 7,
      kind: 'server_error',
      status: 502,
    });
  });

  it('lit un stockage illisible ou mal forme comme un journal vide', () => {
    localStorage.setItem('meteo-fr:diagnostics', '{pas du json');
    expect(readDiagnostics().forecast.lastSuccess).toBeNull();
    localStorage.setItem(
      'meteo-fr:diagnostics',
      JSON.stringify({
        forecast: { lastSuccess: 'hier', lastFailure: { at: 5, kind: 'inconnu' } },
        station: { lastSuccess: 9, lastFailure: { at: 5, kind: 'timeout', status: 'x' } },
        grid: 3,
        vigilance: null,
      }),
    );
    const all = readDiagnostics();
    expect(all.forecast).toEqual({ lastSuccess: null, lastFailure: null });
    expect(all.station).toEqual({
      lastSuccess: 9,
      lastFailure: { at: 5, kind: 'timeout', status: null },
    });
    expect(all.grid).toEqual({ lastSuccess: null, lastFailure: null });
    localStorage.setItem('meteo-fr:diagnostics', '42');
    expect(readDiagnostics().station.lastSuccess).toBeNull();
  });

  it('se rabat sur la memoire quand le stockage refuse l ecriture', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    recordDiagnostic('nowcast', OK, 11);
    expect(readDiagnostics().nowcast.lastSuccess).toBe(11);
    recordDiagnostic('nowcast', { ok: false, failure: { kind: 'timeout' } }, 12);
    expect(readDiagnostics().nowcast.lastFailure?.kind).toBe('timeout');
  });

  it('s efface, et tolere un stockage indisponible', () => {
    recordDiagnostic('forecast', OK, 1);
    clearDiagnostics();
    expect(readDiagnostics().forecast.lastSuccess).toBeNull();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('indisponible');
    });
    expect(() => clearDiagnostics()).not.toThrow();
  });
});

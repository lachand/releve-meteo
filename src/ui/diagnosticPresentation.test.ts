import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_SOURCES } from '../data/cache/diagnostics';
import type { Diagnostics } from '../data/cache/diagnostics';
import { DIAGNOSTIC_LABELS, diagnosticReport, diagnosticSentences } from './diagnosticPresentation';

const SUCCESS = Date.parse('2026-09-28T14:00:00Z');
const FAILURE = Date.parse('2026-09-28T09:00:00Z');

describe('diagnosticSentences', () => {
  it('dit la derniere reussite et le dernier echec, avec leur heure', () => {
    expect(
      diagnosticSentences({
        lastSuccess: SUCCESS,
        lastFailure: { at: FAILURE, kind: 'server_error', status: 503 },
      }),
    ).toEqual({
      success: 'Dernière lecture réussie : lundi 16h.',
      failure: 'Dernier échec : lundi 11h, le service a répondu une erreur 503.',
    });
  });

  it('dit chaque nature d echec en clair', () => {
    const sentence = (kind: 'rate_limited' | 'network' | 'timeout' | 'aborted' | 'malformed') =>
      diagnosticSentences({ lastSuccess: null, lastFailure: { at: FAILURE, kind, status: null } })
        .failure;
    expect(sentence('rate_limited')).toContain('quota du service atteint');
    expect(sentence('network')).toContain('réseau injoignable');
    expect(sentence('timeout')).toContain('délai dépassé');
    expect(sentence('aborted')).toContain('requête interrompue');
    expect(sentence('malformed')).toContain('réponse illisible');
    expect(
      diagnosticSentences({
        lastSuccess: null,
        lastFailure: { at: FAILURE, kind: 'server_error', status: null },
      }).failure,
    ).toContain('le service a répondu une erreur.');
  });

  it('n invente rien pour une source jamais lue', () => {
    expect(diagnosticSentences({ lastSuccess: null, lastFailure: null })).toEqual({
      success: 'Aucune lecture réussie notée sur cet appareil.',
      failure: null,
    });
  });

  it('nomme chaque source', () => {
    for (const source of DIAGNOSTIC_SOURCES) {
      expect(DIAGNOSTIC_LABELS[source].length).toBeGreaterThan(5);
    }
  });
});

describe('diagnosticReport', () => {
  const empty = { lastSuccess: null, lastFailure: null };
  const diagnostics = Object.fromEntries(
    DIAGNOSTIC_SOURCES.map((source) => [source, empty]),
  ) as unknown as Diagnostics;
  const context = {
    now: new Date('2026-09-28T13:27:00Z'),
    userAgent: 'Mozilla/5.0 (test)',
    online: false,
    installed: true,
    language: 'fr-FR',
  };

  it('donne le contexte du navigateur puis chaque source, sans lieu ni cle', () => {
    const report = diagnosticReport(
      {
        ...diagnostics,
        forecast: {
          lastSuccess: SUCCESS,
          lastFailure: { at: FAILURE, kind: 'network', status: null },
        },
      },
      context,
    );
    expect(report).toContain('Établi le 2026-09-28T13:27:00.000Z');
    expect(report).toContain('Navigateur : Mozilla/5.0 (test)');
    expect(report).toContain('hors ligne ; application installée');
    expect(report).toContain(
      'Prévisions (Open-Meteo)\n  Dernière lecture réussie : lundi 16h.\n  Dernier échec : lundi 11h, réseau injoignable.',
    );
    for (const source of DIAGNOSTIC_SOURCES) {
      expect(report).toContain(DIAGNOSTIC_LABELS[source]);
    }
    expect(report).not.toMatch(/lat|lon|apikey/i);
  });

  it('dit onglet de navigateur et en ligne', () => {
    expect(diagnosticReport(diagnostics, { ...context, online: true, installed: false })).toContain(
      'en ligne ; onglet de navigateur',
    );
  });
});

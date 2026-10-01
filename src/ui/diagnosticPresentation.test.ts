import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_SOURCES } from '../data/cache/diagnostics';
import { DIAGNOSTIC_LABELS, diagnosticSentences } from './diagnosticPresentation';

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

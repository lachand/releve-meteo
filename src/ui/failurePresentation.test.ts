import { describe, expect, it } from 'vitest';
import type { HttpFailure } from '../data/clients/http';
import { forecastFailureSentence } from './failurePresentation';

// Lundi 28 septembre 2026, 17 h 05 locales (15 h 05 UTC).
const NOW_MS = Date.parse('2026-09-28T15:05:00Z');

describe('forecastFailureSentence', () => {
  it('dit le quota atteint et l heure de reprise quand le serveur la donne', () => {
    const failure: HttpFailure = { kind: 'rate_limited', retryAfterMs: 35 * 60 * 1000 };
    expect(forecastFailureSentence(failure, NOW_MS)).toBe(
      'Le quota gratuit d’Open-Meteo est atteint. Réessayez vers 17h40 : les relevés déjà chargés restent lisibles hors ligne.',
    );
  });

  it('reste honnete quand aucune heure de reprise n est donnee', () => {
    const failure: HttpFailure = { kind: 'rate_limited', retryAfterMs: 1000 };
    const text = forecastFailureSentence(failure, NOW_MS);
    expect(text).toContain('Le quota gratuit d’Open-Meteo est atteint');
    expect(text).toContain('par minute, par heure et par jour');
    expect(text).not.toMatch(/vers \d/);
  });

  it('ne parle pas de quota pour une autre panne', () => {
    for (const failure of [
      { kind: 'network' },
      { kind: 'timeout' },
      { kind: 'server_error', status: 503 },
    ] as const) {
      expect(forecastFailureSentence(failure, NOW_MS)).toBe(
        'Le service de prévision Open-Meteo ne répond pas. Vérifiez la connexion puis réessayez.',
      );
    }
  });
});

import { describe, expect, it } from 'vitest';
import type { ModelDrift } from '../domain/stationTrace';
import { driftSentence } from './stationTracePresentation';

function drift(recent: number | null, earlier: number | null, trend: ModelDrift['trend']) {
  return { model: 'arome', recent, earlier, trend } satisfies ModelDrift;
}

describe('driftSentence', () => {
  it('dit le sens et l amplitude de l ecart recent, et sa tendance', () => {
    expect(driftSentence(drift(1.2, 0.2, 'widening'))).toBe(
      '1,2\u00a0°C trop chaud depuis 3 h : l’écart s’élargit (0,2\u00a0°C sur les 3 heures d’avant).',
    );
    expect(driftSentence(drift(-1.6, -3.1, 'narrowing'))).toBe(
      '1,6\u00a0°C trop froid depuis 3 h : l’écart se resserre (3,1\u00a0°C sur les 3 heures d’avant).',
    );
    expect(driftSentence(drift(0.9, 1.1, 'steady'))).toBe(
      '0,9\u00a0°C trop chaud depuis 3 h : l’écart est stable (1,1\u00a0°C sur les 3 heures d’avant).',
    );
  });

  it('parle de mesure quand l ecart est dans l arrondi des releves', () => {
    expect(driftSentence(drift(0.2, -0.1, 'steady'))).toBe(
      'Au plus près de la mesure depuis 3 h : l’écart est stable (0,1\u00a0°C sur les 3 heures d’avant).',
    );
  });

  it('ne compare pas a la fenetre precedente quand elle manque', () => {
    expect(driftSentence(drift(1.4, null, null))).toBe('1,4\u00a0°C trop chaud depuis 3 h.');
  });

  it('avoue le manque d heures comparables', () => {
    expect(driftSentence(drift(null, 0.5, null))).toBe(
      'Trop peu d’heures comparables sur les 3 dernières heures.',
    );
  });
});

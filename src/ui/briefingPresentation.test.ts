import { describe, expect, it } from 'vitest';
import type { Briefing } from '../domain/briefing';
import { briefingSentence } from './briefingPresentation';

function briefing(overrides: Partial<Briefing> = {}): Briefing {
  return {
    model: 'arome',
    temperature: 14.2,
    others: 5,
    meanGap: 0.8,
    maxGap: 1.6,
    confidence: 'high',
    drivers: [],
    ...overrides,
  };
}

describe('briefingSentence', () => {
  it('nomme le modele, sa valeur, l ecart des autres et la confiance', () => {
    expect(briefingSentence(briefing())).toBe(
      'AROME prévoit 14\u00a0°C. Les 5 autres modèles s’en écartent de 0,8\u00a0°C en moyenne, au plus 1,6\u00a0°C\u00a0: confiance élevée.',
    );
  });

  it('accorde le singulier quand un seul autre modele couvre l heure', () => {
    expect(
      briefingSentence(briefing({ others: 1, meanGap: 2, maxGap: 2, confidence: 'medium' })),
    ).toBe(
      'AROME prévoit 14\u00a0°C. L’autre modèle s’en écarte de 2,0\u00a0°C\u00a0: confiance moyenne.',
    );
  });

  it('nomme la variable qui tire la confiance vers le bas', () => {
    expect(
      briefingSentence(briefing({ confidence: 'low', drivers: ['wind', 'precipitation'] })),
    ).toBe(
      'AROME prévoit 14\u00a0°C. Les 5 autres modèles s’en écartent de 0,8\u00a0°C en moyenne, au plus 1,6\u00a0°C\u00a0: confiance faible, surtout sur le vent et les précipitations.',
    );
  });

  it('ne nomme pas de variable quand la confiance est elevee', () => {
    expect(briefingSentence(briefing({ drivers: ['temperature'] }))).not.toMatch(/surtout/);
  });

  it('avoue l absence de comparaison quand aucun autre modele ne couvre l heure', () => {
    expect(
      briefingSentence(
        briefing({ others: 0, meanGap: null, maxGap: null, confidence: 'unavailable' }),
      ),
    ).toBe(
      'AROME prévoit 14\u00a0°C. Aucun autre modèle ne couvre cette heure\u00a0: pas de comparaison.',
    );
  });
});

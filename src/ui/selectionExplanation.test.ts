import { describe, expect, it } from 'vitest';
import { rankModels } from '../domain/modelSelection';
import type { Criterion, ModelRanking, SelectionContext } from '../domain/modelSelection';
import type { ModelVerification } from '../domain/reliability';
import type { ModelId } from '../domain/types';
import { criterionSentence, explainSelection, localTemperatureError } from './selectionExplanation';

function ranking(model: ModelId, overrides: Partial<ModelRanking> = {}): ModelRanking {
  return {
    model,
    score: 0,
    criteria: [],
    eligible: true,
    ineligibility: null,
    ...overrides,
  };
}

describe('criterionSentence', () => {
  it('redige la maille pour un critere de resolution significatif', () => {
    const criterion: Criterion = {
      kind: 'resolution',
      points: 8,
      detail: { resolutionKm: 1.3, terrain: 'mountain' },
    };
    expect(criterionSentence('arome', criterion)).toBe(
      'Maille de 1,3 km : le relief crée ici des effets locaux que seule une maille fine résout (terrain montagne).',
    );
  });

  it('retourne null pour une resolution a contribution negligeable', () => {
    const criterion: Criterion = { kind: 'resolution', points: 0.5, detail: {} };
    expect(criterionSentence('arome', criterion)).toBeNull();
  });

  it('utilise le terrain plaine par defaut quand il est absent du detail', () => {
    const criterion: Criterion = { kind: 'resolution', points: 5, detail: {} };
    expect(criterionSentence('arpege', criterion)).toContain('en plaine');
  });

  it('redige une phrase dediee pour ECMWF en moyenne echeance', () => {
    const criterion: Criterion = { kind: 'mediumRange', points: 8, detail: {} };
    expect(criterionSentence('ecmwf', criterion)).toBe(
      'Référence mondiale au-delà de deux ou trois jours, selon les vérifications internationales.',
    );
  });

  it('distingue modele global et regional en moyenne echeance', () => {
    const criterion: Criterion = { kind: 'mediumRange', points: 8, detail: {} };
    expect(criterionSentence('gfs', criterion)).toBe(
      'Tenue correcte en moyenne échéance pour un modèle global.',
    );
    expect(criterionSentence('arpege', criterion)).toBe(
      'Tenue correcte en moyenne échéance pour un modèle régional.',
    );
  });

  it('retourne null pour une moyenne echeance a contribution negligeable', () => {
    const criterion: Criterion = { kind: 'mediumRange', points: 0.9, detail: {} };
    expect(criterionSentence('ecmwf', criterion)).toBeNull();
  });

  it('redige la performance locale meilleure que les pairs', () => {
    const criterion: Criterion = {
      kind: 'localSkill',
      points: 1.5,
      detail: { mae: 1.2, peerMae: 2, sampleCount: 50, variable: 'temperature', leadDays: 1 },
    };
    expect(criterionSentence('arome', criterion)).toBe(
      'Plus juste ici que la moyenne des modèles sur la température : 1,2 °C d’erreur moyenne à J+1 sur 50 h vérifiées, contre 2,0 °C en moyenne pour les autres.',
    );
  });

  it('redige la performance locale moins bonne que les pairs', () => {
    const criterion: Criterion = {
      kind: 'localSkill',
      points: -1.5,
      detail: { mae: 2.5, peerMae: 1.5, sampleCount: 40, variable: 'wind', leadDays: 3 },
    };
    expect(criterionSentence('gfs', criterion)).toBe(
      'Moins juste ici que la moyenne des modèles sur le vent : 2,5 km/h d’erreur moyenne à J+3 sur 40 h vérifiées, contre 1,5 km/h en moyenne pour les autres.',
    );
  });

  it('retourne null pour une performance locale quand un champ du detail manque', () => {
    const criterion: Criterion = {
      kind: 'localSkill',
      points: 1,
      detail: { mae: 1.2, variable: 'temperature', leadDays: 1 }, // peerMae et sampleCount absents
    };
    expect(criterionSentence('arome', criterion)).toBeNull();
  });
});

describe('explainSelection', () => {
  it('indique qu aucun modele ne couvre l instant quand activeModel est null', () => {
    const result = explainSelection([], null, null);
    expect(result).toEqual({
      headline: 'Aucun modèle ne couvre cet instant.',
      reasons: [],
      caveats: [],
      runnerUp: null,
    });
  });

  it('ordonne les raisons du plus lourd au plus leger et isole les criteres defavorables en caveats', () => {
    const active = ranking('arome', {
      score: 9.5,
      eligible: true,
      criteria: [
        { kind: 'mediumRange', points: 3, detail: {} },
        { kind: 'resolution', points: 8, detail: { resolutionKm: 1.3, terrain: 'mountain' } },
        {
          kind: 'localSkill',
          points: -1.5,
          detail: { mae: 2.5, peerMae: 1.5, sampleCount: 40, variable: 'temperature', leadDays: 1 },
        },
      ],
    });
    const runnerUp = ranking('arpege', { score: 7.2, eligible: true });
    const result = explainSelection([active, runnerUp], 'arome', null);

    expect(result.headline).toBe('AROME retenu pour ce lieu et cette échéance.');
    // La resolution (8 points) doit precéder la moyenne echeance (3 points).
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons[0]).toContain('Maille de 1,3');
    expect(result.reasons[1]).toBe('Tenue correcte en moyenne échéance pour un modèle régional.');
    expect(result.caveats).toEqual([
      'Moins juste ici que la moyenne des modèles sur la température : 2,5 °C d’erreur moyenne à J+1 sur 40 h vérifiées, contre 1,5 °C en moyenne pour les autres.',
    ]);
    expect(result.runnerUp).toBe('Suivant : ARPEGE, 7,2 points contre 9,5.');
  });

  it('retombe sur "seul modele disponible" quand aucun critere ne produit de phrase', () => {
    const active = ranking('gfs', {
      score: 0.5,
      criteria: [{ kind: 'resolution', points: 0.5, detail: {} }],
    });
    const result = explainSelection([active], 'gfs', null);
    expect(result.reasons).toEqual(['Seul modèle disponible à cette échéance.']);
    expect(result.runnerUp).toBeNull();
  });

  it('ne propose pas de suivant quand aucun second modele n est eligible', () => {
    const active = ranking('arome', {
      score: 5,
      criteria: [
        { kind: 'resolution', points: 5, detail: { resolutionKm: 1.3, terrain: 'plain' } },
      ],
    });
    const other = ranking('arpege', { eligible: false, ineligibility: 'unavailable' });
    const result = explainSelection([active, other], 'arome', null);
    expect(result.runnerUp).toBeNull();
  });

  it('signale un choix manuel identique a la selection automatique', () => {
    const active = ranking('arome', { eligible: true });
    const other = ranking('arpege', { eligible: true });
    const result = explainSelection([active, other], 'arome', 'arome');
    expect(result).toEqual({
      headline: 'AROME, choisi manuellement.',
      reasons: ['C’est aussi le choix de la sélection automatique.'],
      caveats: [],
      runnerUp: null,
    });
  });

  it('signale un choix manuel different de ce qu aurait retenu la selection automatique', () => {
    const wouldHavePicked = ranking('ecmwf', { eligible: true });
    const chosen = ranking('arome', { eligible: true });
    const result = explainSelection([wouldHavePicked, chosen], 'arome', 'arome');
    expect(result).toEqual({
      headline: 'AROME, choisi manuellement.',
      reasons: ['La sélection automatique aurait retenu ECMWF IFS.'],
      caveats: [],
      runnerUp: null,
    });
  });

  it('signale que le modele prefere ne couvre pas l instant present, sans faire disparaitre l explication du modele actif', () => {
    const active = ranking('arpege', {
      score: 5,
      eligible: true,
      criteria: [{ kind: 'resolution', points: 5, detail: { resolutionKm: 10, terrain: 'plain' } }],
    });
    const result = explainSelection([active], 'arpege', 'ecmwf');
    expect(result.headline).toBe(
      'ARPEGE retenu : ECMWF IFS, votre choix, ne couvre pas cet instant.',
    );
    expect(result.reasons[0]).toContain('Maille de 10');
  });

  it('produit un classement exploitable a partir de rankModels, pour la coherence bout en bout', () => {
    const context: SelectionContext = {
      latitude: 45.76,
      longitude: 4.84,
      terrain: 'plain',
      available: ['arome', 'arpege', 'ecmwf'],
      verification: [],
    };
    const full = rankModels(context, 0);
    const result = explainSelection(full, 'arome', null);
    expect(result.headline).toBe('AROME retenu pour ce lieu et cette échéance.');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons[0]).toContain('Maille de 1,3');
  });
});

describe('localTemperatureError', () => {
  const verifications: readonly ModelVerification[] = [
    {
      model: 'arome',
      variable: 'temperature',
      leadDays: 1,
      stats: { mae: 1.4, bias: 0.1, rmse: 1.6, count: 60 },
      rain: null,
      sampleCount: 60,
      status: 'ready',
      reference: 'observed',
    },
    {
      model: 'arome',
      variable: 'temperature',
      leadDays: 3,
      stats: { mae: 2.1, bias: 0.2, rmse: 2.4, count: 60 },
      rain: null,
      sampleCount: 60,
      status: 'ready',
      reference: 'observed',
    },
    {
      model: 'arome',
      variable: 'wind',
      leadDays: 1,
      stats: { mae: 3.3, bias: 0, rmse: 3.9, count: 60 },
      rain: null,
      sampleCount: 60,
      status: 'ready',
      reference: 'observed',
    },
    {
      model: 'gfs',
      variable: 'temperature',
      leadDays: 1,
      stats: null,
      rain: null,
      sampleCount: 4,
      status: 'collecting',
      reference: 'estimated',
    },
  ];

  it('retourne l erreur J+1 temperature du modele demande', () => {
    expect(localTemperatureError(verifications, 'arome')).toBe(1.4);
  });

  it('ignore les echeances et variables differentes de temperature J+1', () => {
    expect(localTemperatureError(verifications, 'ecmwf')).toBeNull();
  });

  it('retourne null quand l entree existe mais n a pas encore de statistiques (en collecte)', () => {
    expect(localTemperatureError(verifications, 'gfs')).toBeNull();
  });
});

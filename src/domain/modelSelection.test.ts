import { describe, expect, it } from 'vitest';
import { buildHourlyTimeline } from '../../tests/factories';
import {
  buildSelectedCascade,
  leadDaysFor,
  rankModels,
  resolutionWeight,
  selectBestModel,
} from './modelSelection';
import type { SelectionContext } from './modelSelection';
import type { ModelVerification } from './reliability';
import type { ModelId, WeatherVariable } from './types';

const ALL: readonly ModelId[] = [
  'arome',
  'arome_france',
  'icon_d2',
  'arpege',
  'icon_eu',
  'ecmwf',
  'gfs',
];

// Lyon : couvert par tous les modeles, y compris ICON-D2.
const lyon: SelectionContext = {
  latitude: 45.76,
  longitude: 4.84,
  terrain: 'plain',
  available: ALL,
  verification: [],
};

function verification(
  model: ModelId,
  mae: number | null,
  options: { variable?: WeatherVariable; leadDays?: number; count?: number } = {},
): ModelVerification {
  const count = options.count ?? 60;
  return {
    model,
    variable: options.variable ?? 'temperature',
    leadDays: options.leadDays ?? 3,
    stats: mae === null ? null : { mae, bias: 0, rmse: mae, count },
    rain: null,
    sampleCount: count,
    status: mae === null ? 'collecting' : 'ready',
    reference: 'estimated',
  };
}

describe('resolutionWeight', () => {
  it('vaut 1 a echeance nulle ou negative et decroit ensuite', () => {
    expect(resolutionWeight(0)).toBe(1);
    expect(resolutionWeight(-5)).toBe(1);
    expect(resolutionWeight(60)).toBeCloseTo(Math.exp(-1));
  });
});

describe('leadDaysFor', () => {
  it('arrondit a l echeance de verification superieure, au moins 1 jour', () => {
    expect(leadDaysFor(0)).toBe(1);
    expect(leadDaysFor(24)).toBe(1);
    expect(leadDaysFor(25)).toBe(2);
    expect(leadDaysFor(120)).toBe(5);
  });
});

describe('rankModels', () => {
  it('retient AROME a courte echeance, maille la plus fine', () => {
    expect(rankModels(lyon, 0)[0]?.model).toBe('arome');
  });

  it('retient ECMWF en moyenne echeance', () => {
    expect(rankModels(lyon, 120)[0]?.model).toBe('ecmwf');
  });

  it('place les modeles non eligibles en fin, avec leur raison', () => {
    const ranking = rankModels({ ...lyon, available: ['arpege', 'gfs'] }, 12);
    expect(ranking.slice(0, 2).map((r) => r.model)).toEqual(['arpege', 'gfs']);
    const arome = ranking.find((r) => r.model === 'arome');
    expect(arome?.eligible).toBe(false);
    expect(arome?.ineligibility).toBe('unavailable');
  });

  it('exclut ICON-D2 hors de son domaine (Brest)', () => {
    const ranking = rankModels({ ...lyon, latitude: 48.39, longitude: -4.49 }, 6);
    expect(ranking.find((r) => r.model === 'icon_d2')?.ineligibility).toBe('outOfDomain');
  });

  it('exclut un modele au-dela de sa portee et pour une echeance negative', () => {
    expect(rankModels(lyon, 49).find((r) => r.model === 'arome')?.ineligibility).toBe('outOfRange');
    expect(rankModels(lyon, -1).every((r) => r.ineligibility === 'outOfRange')).toBe(true);
  });

  it('departage les egalites par la finesse', () => {
    // Tres loin : le poids de la maille s'annule, AROME, AROME France et
    // ICON-D2 ont exactement la meme qualite a priori de moyenne echeance.
    const ranking = rankModels(lyon, 10_000);
    const tied = ranking.filter((r) => ['arome', 'arome_france', 'icon_d2'].includes(r.model));
    expect(tied.map((r) => r.model)).toEqual(['arome', 'arome_france', 'icon_d2']);
  });

  it('detaille chaque critere pour la justification', () => {
    const best = rankModels(lyon, 0)[0];
    const resolution = best?.criteria.find((c) => c.kind === 'resolution');
    expect(resolution?.detail.resolutionKm).toBe(1.3);
    expect(resolution?.detail.terrain).toBe('plain');
    expect(best?.criteria.find((c) => c.kind === 'mediumRange')?.points).toBe(0);
  });

  it('laisse la performance locale mesuree renverser l a priori', () => {
    const context: SelectionContext = {
      ...lyon,
      verification: [verification('arpege', 0.5), verification('ecmwf', 2)],
    };
    const ranking = rankModels(context, 72);
    expect(ranking[0]?.model).toBe('arpege');
    const skill = ranking[0]?.criteria.find((c) => c.kind === 'localSkill');
    expect(skill?.points).toBeGreaterThan(0);
    expect(skill?.detail).toMatchObject({ mae: 0.5, peerMae: 2, sampleCount: 60, leadDays: 3 });
    const ecmwf = ranking.find((r) => r.model === 'ecmwf');
    expect(ecmwf?.criteria.find((c) => c.kind === 'localSkill')?.points).toBeLessThan(0);
  });

  it('attenue la mesure locale quand l echantillon est petit', () => {
    const small = rankModels(
      {
        ...lyon,
        verification: [
          verification('arpege', 0.5, { count: 5 }),
          verification('ecmwf', 2, { count: 5 }),
        ],
      },
      72,
    );
    const large = rankModels(
      { ...lyon, verification: [verification('arpege', 0.5), verification('ecmwf', 2)] },
      72,
    );
    const points = (ranking: typeof small) =>
      ranking.find((r) => r.model === 'arpege')?.criteria.find((c) => c.kind === 'localSkill')
        ?.points ?? 0;
    expect(points(small)).toBeLessThan(points(large));
  });

  it('choisit l echeance verifiee la plus proche de la cible', () => {
    const context: SelectionContext = {
      ...lyon,
      verification: [
        verification('arpege', 0.5, { leadDays: 1 }),
        verification('arpege', 3, { leadDays: 5 }),
        verification('ecmwf', 2, { leadDays: 1 }),
        verification('ecmwf', 2, { leadDays: 5 }),
      ],
    };
    const skill = rankModels(context, 110)
      .find((r) => r.model === 'arpege')
      ?.criteria.find((c) => c.kind === 'localSkill');
    expect(skill?.detail.leadDays).toBe(5);
    expect(skill?.points).toBeLessThan(0);
  });

  it('ignore les verifications en collecte, sans pair, ou a erreur nulle chez les pairs', () => {
    const context: SelectionContext = {
      ...lyon,
      verification: [
        verification('arpege', null),
        verification('gfs', 1, { variable: 'wind' }),
        verification('icon_eu', 1, { variable: 'precipitation' }),
        verification('ecmwf', 0, { variable: 'precipitation' }),
      ],
    };
    const ranking = rankModels(context, 72);
    const skillOf = (model: ModelId) =>
      ranking.find((r) => r.model === model)?.criteria.filter((c) => c.kind === 'localSkill');
    // arpege : en collecte ; gfs : seul verifie sur le vent ; icon_eu : son
    // seul pair (ecmwf) a une erreur nulle, rapport indefini.
    expect(skillOf('arpege')).toEqual([]);
    expect(skillOf('gfs')).toEqual([]);
    expect(skillOf('icon_eu')).toEqual([]);
    // ecmwf fait mieux que son pair icon_eu : critere present, positif.
    expect(skillOf('ecmwf')?.[0]?.points).toBeGreaterThan(0);
  });
});

describe('selectBestModel', () => {
  it('retourne le premier modele eligible', () => {
    expect(selectBestModel(lyon, 3)?.model).toBe('arome');
  });

  it('retourne null si aucun modele ne couvre l echeance', () => {
    expect(selectBestModel({ ...lyon, available: ['arome'] }, 72)).toBeNull();
  });
});

describe('buildSelectedCascade', () => {
  // Minuit local le 17 aout 2026 (UTC+2) : l'index i est a l'echeance i heures.
  const now = new Date('2026-08-16T22:00:00Z');

  it('produit des segments contigus qui changent de modele avec l echeance', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 240);
    const segments = buildSelectedCascade({ timeline, now, context: lyon });
    expect(segments[0]?.model).toBe('arome');
    expect(segments.at(-1)?.model).toBe('ecmwf');
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i]?.startIndex).toBe((segments[i - 1]?.endIndex ?? -2) + 1);
    }
  });

  it('omet les points passes et ceux sans modele eligible', () => {
    const timeline = buildHourlyTimeline('2026-08-16T20:00', 60);
    const segments = buildSelectedCascade({
      timeline,
      now,
      context: { ...lyon, available: ['arome'] },
    });
    // Index 4 : maintenant ; index 52 : 48 h, fin de la portee d'AROME.
    expect(segments).toEqual([{ model: 'arome', startIndex: 4, endIndex: 52 }]);
  });

  it('respecte le choix manuel tant qu il est eligible, puis reprend la selection automatique', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 120);
    const segments = buildSelectedCascade({ timeline, now, context: lyon, preferred: 'arpege' });
    expect(segments[0]).toEqual({ model: 'arpege', startIndex: 0, endIndex: 102 });
    expect(segments[1]?.model).toBe('ecmwf');
  });

  it('ignore un choix manuel indisponible', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 6);
    const segments = buildSelectedCascade({
      timeline,
      now,
      context: { ...lyon, available: ['arome', 'gfs'] },
      preferred: 'icon_d2',
    });
    expect(segments).toEqual([{ model: 'arome', startIndex: 0, endIndex: 5 }]);
  });

  it('ne retient un modele que la ou il a effectivement des donnees', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 12);
    const segments = buildSelectedCascade({
      timeline,
      now,
      context: { ...lyon, available: ['arome', 'arpege'] },
      hasData: (model, index) => model !== 'arome' || index < 8,
    });
    expect(segments).toEqual([
      { model: 'arome', startIndex: 0, endIndex: 7 },
      { model: 'arpege', startIndex: 8, endIndex: 11 },
    ]);
  });

  it('retarde une bascule entre scores proches grace a l hysteresis', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 96);
    const context: SelectionContext = { ...lyon, available: ['icon_eu', 'ecmwf'] };
    const strict = buildSelectedCascade({ timeline, now, context, hysteresisPoints: 0 });
    const damped = buildSelectedCascade({ timeline, now, context });
    expect(strict.map((s) => s.model)).toEqual(['icon_eu', 'ecmwf']);
    expect(damped.map((s) => s.model)).toEqual(['icon_eu', 'ecmwf']);
    expect(damped[1]?.startIndex ?? 0).toBeGreaterThan(strict[1]?.startIndex ?? 0);
  });
});

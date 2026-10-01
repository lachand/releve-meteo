import { describe, expect, it } from 'vitest';
import { buildHourlyTimeline } from '../../tests/factories';
import {
  SELECTION_WEIGHTS,
  buildSelectedCascade,
  evidenceWeight,
  explainSwitch,
  leadDaysFor,
  priorFactor,
  rankModels,
  resolutionWeight,
  selectBestModel,
} from './modelSelection';
import type { SelectionContext } from './modelSelection';
import type { LeadBucketScores, LeadScores } from './leadScores';
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

describe('evidenceWeight', () => {
  it('compte l echantillon en jours : nul sans mesure, la moitie a sept jours, jamais 1', () => {
    expect(evidenceWeight(0)).toBe(0);
    expect(evidenceWeight(-12)).toBe(0);
    expect(evidenceWeight(7 * 24)).toBeCloseTo(0.5);
    expect(evidenceWeight(30 * 24)).toBeCloseTo(30 / 37);
    expect(evidenceWeight(10_000)).toBeLessThan(1);
  });
});

describe('priorFactor', () => {
  it('garde tout l a priori de maille sans mesure locale exploitable', () => {
    expect(priorFactor([], 24)).toBe(1);
    expect(priorFactor([verification('arome', null)], 24)).toBe(1);
    // La pluie et le vent ne comptent pas : l'a priori est celui de la maille.
    expect(priorFactor([verification('arome', 1, { variable: 'wind', count: 700 })], 24)).toBe(1);
  });

  it('efface jusqu a la moitie de l a priori quand les mesures sont longues', () => {
    const month = ALL.map((model) => verification(model, 1.2, { leadDays: 1, count: 720 }));
    expect(priorFactor(month, 24)).toBeCloseTo(1 - 0.5 * (30 / 37));
    const few = ALL.map((model) => verification(model, 1.2, { leadDays: 1, count: 24 }));
    expect(priorFactor(few, 24)).toBeCloseTo(1 - 0.5 * evidenceWeight(24));
    expect(priorFactor(few, 24)).toBeGreaterThan(0.93);
  });

  it('prend la mediane des modeles, pour qu aucun n en soit avantage, et l echeance la plus proche', () => {
    const odd = [
      verification('arome', 1, { leadDays: 1, count: 24 }),
      verification('icon_d2', 1, { leadDays: 1, count: 240 }),
      verification('arpege', 1, { leadDays: 1, count: 2400 }),
    ];
    expect(priorFactor(odd, 24)).toBeCloseTo(1 - 0.5 * evidenceWeight(240));
    const even = [odd[0], odd[1]].filter((v): v is ModelVerification => v !== undefined);
    expect(priorFactor(even, 24)).toBeCloseTo(1 - 0.5 * evidenceWeight(132));
    // Un modele verifie a J+1 et J+5 : a 120 h, c'est J+5 qui compte.
    const leads = [
      verification('arome', 1, { leadDays: 1, count: 24 }),
      verification('arome', 1, { leadDays: 5, count: 720 }),
    ];
    expect(priorFactor(leads, 120)).toBeCloseTo(1 - 0.5 * evidenceWeight(720));
    expect(priorFactor(leads, 24)).toBeCloseTo(1 - 0.5 * evidenceWeight(24));
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

/** Notes courtes : `maes` donne l'erreur moyenne de chaque modele dans la classe d'echeance `label`. */
function shortScores(
  label: '1 h' | '3 h' | '6 h' | '12 h',
  maes: Partial<Record<ModelId, number>>,
  pairs = 20,
): LeadScores {
  const bounds = { '1 h': [1, 1], '3 h': [2, 3], '6 h': [4, 6], '12 h': [7, 12] } as const;
  const buckets: LeadBucketScores[] = (['1 h', '3 h', '6 h', '12 h'] as const).map((l) => ({
    label: l,
    from: bounds[l][0],
    to: bounds[l][1],
    models:
      l === label
        ? (Object.entries(maes) as [ModelId, number][]).map(([model, mae]) => ({
            model,
            pairs,
            bias: 0,
            mae,
          }))
        : [],
  }));
  return { buckets, snapshots: 30, oldestIssuedAt: '2026-09-27T08:00', ready: true };
}

describe('rankModels, notes courtes (shortSkill)', () => {
  const withShort = (shortLead: LeadScores): SelectionContext => ({ ...lyon, shortLead });

  it('ajoute un critere shortSkill a courte echeance, au profit du modele le plus proche des mesures', () => {
    const context = withShort(shortScores('3 h', { arome: 2, arpege: 0.5, gfs: 2 }));
    const ranking = rankModels(context, 3);
    const arpege = ranking.find((r) => r.model === 'arpege');
    const arome = ranking.find((r) => r.model === 'arome');
    const short = arpege?.criteria.find((c) => c.kind === 'shortSkill');
    expect(short?.points).toBeGreaterThan(0);
    expect(short?.detail).toMatchObject({
      bucket: '3 h',
      variable: 'temperature',
      sampleCount: 20,
    });
    expect(arome?.criteria.find((c) => c.kind === 'shortSkill')?.points).toBeLessThan(0);
  });

  it('peut renverser l a priori de maille quand l ecart mesure est net', () => {
    const base = rankModels(lyon, 3)[0]?.model;
    expect(base).toBe('arome');
    const context = withShort(
      // Deux semaines de mesures (336 heures) : assez pour que l'ecart pese.
      shortScores(
        '3 h',
        { arome: 3, arome_france: 3, icon_d2: 3, arpege: 0.2, icon_eu: 3, gfs: 3 },
        336,
      ),
    );
    const ranked = rankModels(context, 3);
    const aromeShort = ranked
      .find((r) => r.model === 'arome')
      ?.criteria.find((c) => c.kind === 'shortSkill');
    const arpegeShort = ranked
      .find((r) => r.model === 'arpege')
      ?.criteria.find((c) => c.kind === 'shortSkill');
    expect((arpegeShort?.points ?? 0) - (aromeShort?.points ?? 0)).toBeGreaterThan(
      SELECTION_WEIGHTS.shortSkill * 0.5,
    );
  });

  it('remplace le volet temperature de la mesure locale, sans toucher pluie et vent', () => {
    const context: SelectionContext = {
      ...withShort(shortScores('3 h', { arome: 1, arpege: 2 })),
      verification: [
        verification('arome', 1, { leadDays: 1 }),
        verification('arpege', 2, { leadDays: 1 }),
        verification('arome', 1, { leadDays: 1, variable: 'wind' }),
        verification('arpege', 2, { leadDays: 1, variable: 'wind' }),
      ],
    };
    const arome = rankModels(context, 3).find((r) => r.model === 'arome');
    const locals = arome?.criteria.filter((c) => c.kind === 'localSkill') ?? [];
    expect(locals.map((c) => c.detail.variable)).toEqual(['wind']);
    expect(arome?.criteria.some((c) => c.kind === 'shortSkill')).toBe(true);
  });

  it('retombe sur la mesure locale quotidienne sans note courte exploitable', () => {
    const verifs = [
      verification('arome', 1, { leadDays: 1 }),
      verification('arpege', 2, { leadDays: 1 }),
    ];
    const noScores: LeadScores = { ...shortScores('3 h', {}), ready: false };
    for (const shortLead of [undefined, noScores, shortScores('6 h', { arome: 1, arpege: 2 })]) {
      const context: SelectionContext = { ...lyon, verification: verifs, shortLead };
      const arome = rankModels(context, 3).find((r) => r.model === 'arome');
      expect(arome?.criteria.some((c) => c.kind === 'shortSkill')).toBe(false);
      expect(arome?.criteria.filter((c) => c.kind === 'localSkill')).toHaveLength(1);
    }
  });

  it('ne s applique qu aux echeances de 0 a 12 h, et a un modele note avec au moins un pair', () => {
    const context = withShort(shortScores('12 h', { arome: 1, arpege: 2 }));
    expect(rankModels(context, 12.5)[0]?.criteria.some((c) => c.kind === 'shortSkill')).toBe(false);
    expect(rankModels(context, -2)[0]?.criteria.some((c) => c.kind === 'shortSkill')).toBe(false);
    expect(rankModels(context, 12)[0]?.criteria.some((c) => c.kind === 'shortSkill')).toBe(true);
    // Un seul modele note dans la classe : aucun pair, donc aucun critere.
    const alone = withShort(shortScores('3 h', { arome: 1 }));
    expect(rankModels(alone, 3).some((r) => r.criteria.some((c) => c.kind === 'shortSkill'))).toBe(
      false,
    );
    // Des pairs sans erreur : rien a comparer.
    const exact = withShort(shortScores('3 h', { arome: 0, arpege: 0 }));
    expect(rankModels(exact, 3).some((r) => r.criteria.some((c) => c.kind === 'shortSkill'))).toBe(
      false,
    );
  });

  it('classe une echeance fractionnaire dans la classe suivante, au moins 1 h', () => {
    const context = withShort(shortScores('1 h', { arome: 1, arpege: 2 }));
    expect(rankModels(context, 0.2)[0]?.criteria.some((c) => c.kind === 'shortSkill')).toBe(true);
    expect(rankModels(context, 1.4)[0]?.criteria.some((c) => c.kind === 'shortSkill')).toBe(false);
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

describe('explainSwitch', () => {
  it('dit qu un modele a atteint la fin de sa portee, quand c est la raison', () => {
    // AROME France ne va pas au-dela de 51 h : a 60 h il ne couvre plus l'echeance.
    const reason = explainSwitch({
      context: lyon,
      from: 'arome_france',
      to: 'arpege',
      leadHours: 60,
    });
    expect(reason).toMatchObject({
      kind: 'availability',
      from: 'arome_france',
      to: 'arpege',
      cause: 'outOfRange',
      leadHours: 60,
    });
  });

  it('dit qu un modele n a plus de valeurs, meme dans sa portee nominale', () => {
    const reason = explainSwitch({
      context: lyon,
      from: 'arome',
      to: 'arpege',
      leadHours: 20,
      fromHasData: false,
    });
    expect(reason).toMatchObject({ kind: 'availability', cause: 'noData' });
  });

  it('dit qu un modele est absent ou hors de son domaine', () => {
    const missing = explainSwitch({
      context: { ...lyon, available: ['arpege'] },
      from: 'arome',
      to: 'arpege',
      leadHours: 10,
    });
    expect(missing).toMatchObject({ kind: 'availability', cause: 'unavailable' });
    const brest = { ...lyon, latitude: 48.39, longitude: -4.49 };
    const outside = explainSwitch({ context: brest, from: 'icon_d2', to: 'arome', leadHours: 10 });
    expect(outside).toMatchObject({ kind: 'availability', cause: 'outOfDomain' });
  });

  it('dit le choix manuel quand le modele rejoint est celui que l utilisateur a choisi', () => {
    const reason = explainSwitch({
      context: lyon,
      from: 'arpege',
      to: 'arome',
      leadHours: 10,
      preferred: 'arome',
    });
    expect(reason).toMatchObject({ kind: 'manual', to: 'arome', gain: 0 });
  });

  it('retient le critere qui a le plus pese : la maille a courte echeance', () => {
    const reason = explainSwitch({ context: lyon, from: 'gfs', to: 'arome', leadHours: 3 });
    expect(reason.kind).toBe('resolution');
    expect(reason.gain).toBeGreaterThan(0);
    expect(reason.toDetail?.resolutionKm).toBe(1.3);
    expect(reason.fromDetail?.resolutionKm).toBeGreaterThan(10);
  });

  it('retient la qualite en moyenne echeance quand la maille ne compte plus', () => {
    const reason = explainSwitch({ context: lyon, from: 'arpege', to: 'ecmwf', leadHours: 90 });
    expect(reason.kind).toBe('mediumRange');
  });

  it('retient la mesure locale quand c est elle qui a fait la difference', () => {
    // A 72 h les a priori sont proches ; ICON-EU, nettement plus juste ici, passe devant ARPEGE.
    const context: SelectionContext = {
      ...lyon,
      verification: [
        ...ALL.filter((m) => m !== 'icon_eu').map((m) => verification(m, 2, { leadDays: 3 })),
        verification('icon_eu', 0.4, { leadDays: 3 }),
        // Un volet de vent, moins determinant : le detail rendu est celui qui pese le plus.
        ...ALL.map((m) =>
          verification(m, m === 'icon_eu' ? 3 : 4, { leadDays: 3, variable: 'wind' }),
        ),
      ],
    };
    const reason = explainSwitch({ context, from: 'arpege', to: 'icon_eu', leadHours: 72 });
    expect(reason.kind).toBe('localSkill');
    expect(reason.toDetail?.mae).toBe(0.4);
    expect(reason.toDetail?.variable).toBe('temperature');
  });

  it('retient la note courte quand elle a fait la difference', () => {
    const context: SelectionContext = {
      ...lyon,
      shortLead: shortScores('3 h', { arpege: 0.3, gfs: 2.5, icon_eu: 2.5 }),
    };
    const reason = explainSwitch({ context, from: 'arome', to: 'arpege', leadHours: 3 });
    expect(reason.kind).toBe('shortSkill');
    expect(reason.toDetail?.bucket).toBe('3 h');
    // AROME n'a pas de note a cette echeance : rien a citer pour lui.
    expect(reason.fromDetail).toBeNull();
  });

  it('ne rend pas un gain negatif quand aucun critere ne favorise le modele rejoint', () => {
    // Deux modeles a criteres identiques (meme classe, memes donnees) : rien ne distingue.
    const reason = explainSwitch({
      context: lyon,
      from: 'arome',
      to: 'arome_france',
      leadHours: 3,
    });
    expect(reason.gain).toBeGreaterThanOrEqual(0);
  });
});

describe('rankModels, la mesure locale l emporte sur la maille', () => {
  // Plateau comme Virieu (468 m) ; un mois de mesures de temperature a J+1.
  const plateau: SelectionContext = { ...lyon, terrain: 'plateau' };
  const month = (maes: Partial<Record<ModelId, number>>): readonly ModelVerification[] =>
    (Object.entries(maes) as [ModelId, number][]).map(([model, mae]) =>
      verification(model, mae, { leadDays: 1, count: 720 }),
    );
  // Erreurs lues sur un calendrier reel : ICON-D2 le plus juste, ARPEGE le moins.
  const measured = month({
    arome: 1.45,
    arome_france: 1.4,
    icon_d2: 1.2,
    arpege: 2.2,
    icon_eu: 1.45,
    gfs: 1.6,
  });

  it('garde AROME sans mesure, a priori de maille seul', () => {
    for (const lead of [0, 24, 48]) {
      expect(rankModels(plateau, lead)[0]?.model).toBe('arome');
    }
  });

  it('retient ICON-D2 des 12 h quand un mois de mesures le donne plus juste, AROME restant juste derriere', () => {
    const context = { ...plateau, verification: measured };
    for (const lead of [12, 24, 36, 48]) {
      const ranking = rankModels(context, lead);
      expect(ranking[0]?.model).toBe('icon_d2');
      expect(ranking[1]?.model).toBe('arome');
    }
    // A l'instant meme, la maille d'AROME garde une courte avance, sous l'hysteresis
    // de la cascade (0,5 point) : le modele deja retenu n'est pas change pour si peu.
    const [first, second] = rankModels(context, 0);
    expect(first?.model).toBe('arome');
    expect(second?.model).toBe('icon_d2');
    expect((first?.score ?? 0) - (second?.score ?? 0)).toBeLessThan(0.5);
  });

  it('ne retourne pas la selection sur un ecart negligeable', () => {
    const tie = month({ arome: 1.2, arome_france: 1.2, icon_d2: 1.2, arpege: 1.2, icon_eu: 1.2 });
    expect(rankModels({ ...plateau, verification: tie }, 0)[0]?.model).toBe('arome');
  });

  it('dit combien de l a priori de maille reste, pour la justification', () => {
    const ranking = rankModels({ ...plateau, verification: measured }, 24);
    const resolution = ranking[0]?.criteria.find((c) => c.kind === 'resolution');
    expect(resolution?.detail.priorFactor).toBeCloseTo(1 - 0.5 * (30 / 37));
    const without = rankModels(plateau, 24)[0]?.criteria.find((c) => c.kind === 'resolution');
    expect(without?.detail.priorFactor).toBe(1);
  });

  it('donne le maximum a une erreur nulle, sans diviser par zero', () => {
    const perfect = month({ arome: 0, icon_d2: 1.2, arpege: 2 });
    const skill = rankModels({ ...plateau, verification: perfect }, 0)
      .find((r) => r.model === 'arome')
      ?.criteria.find((c) => c.kind === 'localSkill');
    expect(skill?.points).toBeCloseTo(
      SELECTION_WEIGHTS.localSkill * 0.5 * (720 / 24 / (720 / 24 + 7)),
    );
  });
});

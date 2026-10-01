import type { LeadScores } from './leadScores';
import type { CascadeSegment } from './modelCascade';
import { MODEL_ORDER, MODEL_SPECS, coversLocation, terrainFit } from './models';
import type { ErrorStats, ModelVerification } from './reliability';
import { leadHoursFrom } from './time';
import type { LocalIsoHour, ModelId, TerrainKind, WeatherVariable } from './types';

/*
 * Selection automatique du meilleur modele pour un lieu et une echeance
 * (ROADMAP.md phase A). Le score est une somme de criteres nommes, chacun
 * explicable a l'utilisateur : aucun coefficient cache.
 *
 *   score = resolution/terrain (a priori, poids decroissant avec l'echeance)
 *         + qualite de moyenne echeance (a priori, poids croissant)
 *         + performance locale mesuree (retrait vers 0 selon l'echantillon)
 *
 * Un modele non eligible (absent de la reponse, hors domaine, echeance
 * hors portee) n'est jamais retenu mais reste liste avec sa raison.
 */

export interface SelectionContext {
  readonly latitude: number;
  readonly longitude: number;
  readonly terrain: TerrainKind;
  /** Modeles effectivement presents dans le bundle. */
  readonly available: readonly ModelId[];
  /** Verifications locales disponibles, toutes echeances et variables. */
  readonly verification: readonly ModelVerification[];
  /**
   * Notes de 1 a 12 h tirees des instantanes enregistres par l'application
   * (domain/leadScores.ts). Absentes ou en collecte : sans effet.
   */
  readonly shortLead?: LeadScores;
}

export type CriterionKind = 'resolution' | 'mediumRange' | 'localSkill' | 'shortSkill';

export interface Criterion {
  readonly kind: CriterionKind;
  readonly points: number;
  /** Donnees brutes pour que l'interface redige la justification. */
  readonly detail: {
    readonly resolutionKm?: number;
    readonly terrain?: TerrainKind;
    readonly leadHours?: number;
    readonly mae?: number;
    readonly peerMae?: number;
    readonly sampleCount?: number;
    readonly variable?: WeatherVariable;
    readonly leadDays?: number;
    /** Classe d'echeance courte (« 3 h ») d'un critere shortSkill. */
    readonly bucket?: string;
    /** Part de l'a priori de maille conservee (1 sans mesure locale), pour la phrase. */
    readonly priorFactor?: number;
  };
}

export type IneligibilityReason = 'unavailable' | 'outOfDomain' | 'outOfRange';

export interface ModelRanking {
  readonly model: ModelId;
  readonly score: number;
  readonly criteria: readonly Criterion[];
  readonly eligible: boolean;
  readonly ineligibility: IneligibilityReason | null;
}

/** Poids maximal de chaque famille de criteres, en points. */
export const SELECTION_WEIGHTS = {
  resolution: 10,
  mediumRange: 10,
  localSkill: 8,
  /**
   * Performance mesuree a 12 h ou moins, sur la temperature seule : elle
   * remplace alors le volet temperature de la mesure locale (4 points au
   * plus), un peu plus lourd parce que plus precis a ces echeances.
   */
  shortSkill: 5,
  /** Echelle de decroissance du poids de la maille avec l'echeance, heures. */
  resolutionDecayHours: 60,
  /**
   * Jours de mesures pour lesquels la mesure locale pese a moitie : l'echantillon
   * se compte en jours, pas en heures, les heures d'une meme journee se
   * ressemblant trop pour valoir autant d'observations independantes.
   */
  evidenceHalfDays: 7,
  /**
   * Part de l'a priori de maille qui s'efface quand les mesures locales sont
   * abondantes : la maille est une hypothese, les mesures sont des faits.
   */
  priorFade: 0.5,
} as const;

/** Heures de mesure par jour : un echantillon horaire vaut 1/24 de jour. */
const HOURS_PER_DAY = 24;

/** Poids de la mesure locale dans [0, 1[ pour `pairs` heures de mesures. */
export function evidenceWeight(pairs: number): number {
  const days = Math.max(0, pairs) / HOURS_PER_DAY;
  return days / (days + SELECTION_WEIGHTS.evidenceHalfDays);
}

/**
 * Part de l'a priori de maille conservee, dans ]0, 1] : 1 sans mesure, la
 * moitie apres de longues mesures. Commune a tous les modeles, pour ne jamais
 * favoriser un modele sans mesure sur ceux qui en ont.
 */
export function priorFactor(verification: readonly ModelVerification[], leadHours: number): number {
  const targetDays = leadDaysFor(leadHours);
  const perModel = new Map<ModelId, ScoredVerification>();
  for (const v of verification) {
    if (v.variable !== 'temperature' || v.stats === null) {
      continue;
    }
    const known = perModel.get(v.model);
    if (
      known === undefined ||
      Math.abs(v.leadDays - targetDays) < Math.abs(known.leadDays - targetDays)
    ) {
      perModel.set(v.model, v as ScoredVerification);
    }
  }
  const counts = [...perModel.values()].map((v) => v.sampleCount).sort((a, b) => a - b);
  if (counts.length === 0) {
    return 1;
  }
  const median =
    counts.length % 2 === 1
      ? (counts[(counts.length - 1) / 2] ?? 0)
      : ((counts[counts.length / 2 - 1] ?? 0) + (counts[counts.length / 2] ?? 0)) / 2;
  return 1 - SELECTION_WEIGHTS.priorFade * evidenceWeight(median);
}

/**
 * Avantage d'un modele sur la moyenne de ses pairs, dans [-1, 1], a l'echelle
 * des rapports d'erreur : une erreur deux fois plus faible vaut le maximum, deux
 * fois plus forte le minimum. Une erreur nulle vaut le maximum.
 */
function relativeSkill(ownMae: number, peerMae: number): number {
  if (ownMae <= 0) {
    return 1;
  }
  return Math.max(-1, Math.min(1, Math.log(peerMae / ownMae) / Math.LN2));
}

/**
 * Qualite a priori en moyenne echeance (au-dela de 3 jours), d'apres les
 * scores publies de verification internationale (WMO Lead Centre on
 * Deterministic NWP Verification) : ECMWF en tete, puis ICON et ARPEGE,
 * GFS en retrait. Les modeles a aire limitee n'ont pas de moyenne echeance
 * et ne sont de toute facon pas eligibles au-dela de 48 h.
 */
const MEDIUM_RANGE_QUALITY: Readonly<Record<ModelId, number>> = {
  arome: 0.7,
  arome_france: 0.7,
  icon_d2: 0.7,
  arpege: 0.78,
  icon_eu: 0.8,
  ecmwf: 1,
  gfs: 0.68,
};

type ScoredVerification = ModelVerification & { readonly stats: ErrorStats };

/** Poids relatif des variables dans la performance locale. */
const VARIABLE_WEIGHTS: Readonly<Record<WeatherVariable, number>> = {
  temperature: 0.5,
  precipitation: 0.3,
  wind: 0.2,
};

function eligibility(
  model: ModelId,
  leadHours: number,
  context: SelectionContext,
): IneligibilityReason | null {
  if (!context.available.includes(model)) {
    return 'unavailable';
  }
  if (!coversLocation(model, context.latitude, context.longitude)) {
    return 'outOfDomain';
  }
  if (leadHours < 0 || leadHours > MODEL_SPECS[model].maxLeadHours) {
    return 'outOfRange';
  }
  return null;
}

/** Poids de la maille dans [0, 1], 1 a echeance nulle. */
export function resolutionWeight(leadHours: number): number {
  return Math.exp(-Math.max(0, leadHours) / SELECTION_WEIGHTS.resolutionDecayHours);
}

/** Echeance en jours de verification la plus proche d'une echeance en heures. */
export function leadDaysFor(leadHours: number): number {
  return Math.max(1, Math.ceil(leadHours / 24));
}

/**
 * Performance locale d'un modele : erreur relative a la moyenne des autres
 * modeles verifies, a l'echeance de verification la plus proche disponible.
 * Positif si le modele fait mieux que ses pairs.
 */
function localSkillCriteria(
  model: ModelId,
  leadHours: number,
  verification: readonly ModelVerification[],
): readonly Criterion[] {
  const targetDays = leadDaysFor(leadHours);
  const criteria: Criterion[] = [];
  for (const variable of Object.keys(VARIABLE_WEIGHTS) as WeatherVariable[]) {
    const forVariable = verification.filter(
      (v): v is ScoredVerification => v.variable === variable && v.stats !== null,
    );
    // Echeance disponible la plus proche de la cible, pour ce modele.
    const own = forVariable
      .filter((v) => v.model === model)
      .sort((a, b) => Math.abs(a.leadDays - targetDays) - Math.abs(b.leadDays - targetDays))[0];
    if (own === undefined) {
      continue;
    }
    const peers = forVariable.filter((v) => v.model !== model && v.leadDays === own.leadDays);
    if (peers.length === 0) {
      continue;
    }
    const peerMae = peers.reduce((sum, v) => sum + v.stats.mae, 0) / peers.length;
    if (peerMae <= 0) {
      continue;
    }
    const relative = relativeSkill(own.stats.mae, peerMae);
    const shrink = evidenceWeight(own.sampleCount);
    const points = relative * shrink * SELECTION_WEIGHTS.localSkill * VARIABLE_WEIGHTS[variable];
    criteria.push({
      kind: 'localSkill',
      points,
      detail: {
        mae: own.stats.mae,
        peerMae,
        sampleCount: own.sampleCount,
        variable,
        leadDays: own.leadDays,
      },
    });
  }
  return criteria;
}

/** Plus longue echeance, heures, couverte par les notes courtes. */
const SHORT_LEAD_MAX_HOURS = 12;

/**
 * Performance a courte echeance d'un modele, mesuree station a station sur
 * les prevues que l'application a enregistrees : erreur relative aux autres
 * modeles notes dans la meme classe d'echeance. Null hors de 0 a 12 h, sans
 * note exploitable pour ce modele, ou sans pair a comparer.
 */
function shortSkillCriterion(
  model: ModelId,
  leadHours: number,
  shortLead: LeadScores | undefined,
): Criterion | null {
  if (shortLead === undefined || leadHours < 0 || leadHours > SHORT_LEAD_MAX_HOURS) {
    return null;
  }
  const hours = Math.max(1, Math.ceil(leadHours));
  const bucket = shortLead.buckets.find((b) => hours >= b.from && hours <= b.to);
  const own = bucket?.models.find((m) => m.model === model);
  if (bucket === undefined || own === undefined) {
    return null;
  }
  const peers = bucket.models.filter((m) => m.model !== model);
  if (peers.length === 0) {
    return null;
  }
  const peerMae = peers.reduce((sum, m) => sum + m.mae, 0) / peers.length;
  if (peerMae <= 0) {
    return null;
  }
  const relative = relativeSkill(own.mae, peerMae);
  const shrink = evidenceWeight(own.pairs);
  return {
    kind: 'shortSkill',
    points: relative * shrink * SELECTION_WEIGHTS.shortSkill,
    detail: {
      mae: own.mae,
      peerMae,
      sampleCount: own.pairs,
      variable: 'temperature',
      leadHours,
      bucket: bucket.label,
    },
  };
}

/** Classement complet des modeles pour une echeance, du meilleur au moins bon. */
export function rankModels(context: SelectionContext, leadHours: number): readonly ModelRanking[] {
  const prior = priorFactor(context.verification, leadHours);
  const rankings = MODEL_ORDER.map((model): ModelRanking => {
    const ineligibility = eligibility(model, leadHours, context);
    const weight = resolutionWeight(leadHours);
    const spec = MODEL_SPECS[model];
    // Les notes courtes, plus precises a 12 h ou moins, remplacent le volet
    // temperature de la mesure locale ; pluie et vent restent comptes.
    const short = shortSkillCriterion(model, leadHours, context.shortLead);
    const localSkills = localSkillCriteria(model, leadHours, context.verification).filter(
      (c) => short === null || c.detail.variable !== 'temperature',
    );
    const criteria: Criterion[] = [
      {
        kind: 'resolution',
        points: SELECTION_WEIGHTS.resolution * weight * terrainFit(model, context.terrain) * prior,
        detail: {
          resolutionKm: spec.resolutionKm,
          terrain: context.terrain,
          leadHours,
          priorFactor: prior,
        },
      },
      {
        kind: 'mediumRange',
        points: SELECTION_WEIGHTS.mediumRange * (1 - weight) * MEDIUM_RANGE_QUALITY[model],
        detail: { leadHours },
      },
      ...localSkills,
      ...(short === null ? [] : [short]),
    ];
    const score = criteria.reduce((sum, c) => sum + c.points, 0);
    return {
      model,
      score,
      criteria,
      eligible: ineligibility === null,
      ineligibility,
    };
  });
  return rankings.sort((a, b) => {
    if (a.eligible !== b.eligible) {
      return a.eligible ? -1 : 1;
    }
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return MODEL_SPECS[a.model].finenessRank - MODEL_SPECS[b.model].finenessRank;
  });
}

export type SwitchKind = CriterionKind | 'availability' | 'manual';

/** Pourquoi la cascade passe d'un modele a l'autre en un point de la timeline. */
export interface SwitchReason {
  readonly kind: SwitchKind;
  readonly from: ModelId;
  readonly to: ModelId;
  readonly leadHours: number;
  /** Points d'avance du modele rejoint sur le critere decisif ; 0 pour 'availability' et 'manual'. */
  readonly gain: number;
  /** Pourquoi l'ancien modele ne pouvait plus etre retenu ('availability' seulement). */
  readonly cause: IneligibilityReason | 'noData' | null;
  /** Detail du critere decisif pour chacun des deux modeles, pour la phrase. */
  readonly fromDetail: Criterion['detail'] | null;
  readonly toDetail: Criterion['detail'] | null;
}

const CRITERION_KINDS: readonly CriterionKind[] = [
  'resolution',
  'mediumRange',
  'localSkill',
  'shortSkill',
];

/** Points d'une famille de criteres (la mesure locale en compte un par variable). */
function pointsOf(criteria: readonly Criterion[], kind: CriterionKind): number {
  return criteria.filter((c) => c.kind === kind).reduce((sum, c) => sum + c.points, 0);
}

/** Detail du critere de cette famille qui pese le plus, ou null si le modele n'en a pas. */
function detailOf(criteria: readonly Criterion[], kind: CriterionKind): Criterion['detail'] | null {
  const [heaviest] = criteria
    .filter((c) => c.kind === kind)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  return heaviest?.detail ?? null;
}

/**
 * Raison d'une bascule de la cascade, a partir des memes criteres chiffres
 * que le classement : un modele qui n'a plus de valeurs, le choix manuel de
 * l'utilisateur, ou sinon le critere sur lequel le modele rejoint a le plus
 * gagne sur l'ancien a cette echeance.
 */
export function explainSwitch(input: {
  readonly context: SelectionContext;
  readonly from: ModelId;
  readonly to: ModelId;
  readonly leadHours: number;
  readonly preferred?: ModelId | null;
  /** Faux quand l'ancien modele n'a plus de valeur a ce point, malgre sa portee nominale. */
  readonly fromHasData?: boolean;
}): SwitchReason {
  const { context, from, to, leadHours } = input;
  const ranking = rankModels(context, leadHours);
  const fromRanking = ranking.filter((r) => r.model === from);
  const fromCriteria = fromRanking.flatMap((r) => r.criteria);
  const toCriteria = ranking.filter((r) => r.model === to).flatMap((r) => r.criteria);
  const base = { from, to, leadHours, fromDetail: null, toDetail: null };
  const cause = fromRanking[0]?.ineligibility ?? (input.fromHasData === false ? 'noData' : null);
  if (cause !== null) {
    return { ...base, kind: 'availability', gain: 0, cause };
  }
  if (input.preferred === to) {
    return { ...base, kind: 'manual', gain: 0, cause: null };
  }
  let kind: CriterionKind = 'resolution';
  let gain = Number.NEGATIVE_INFINITY;
  for (const candidate of CRITERION_KINDS) {
    const difference = pointsOf(toCriteria, candidate) - pointsOf(fromCriteria, candidate);
    if (difference > gain) {
      kind = candidate;
      gain = difference;
    }
  }
  return {
    ...base,
    kind,
    gain,
    cause: null,
    fromDetail: detailOf(fromCriteria, kind),
    toDetail: detailOf(toCriteria, kind),
  };
}

/** Meilleur modele eligible, ou null si aucun ne couvre l'echeance. */
export function selectBestModel(context: SelectionContext, leadHours: number): ModelRanking | null {
  const best = rankModels(context, leadHours)[0];
  return best?.eligible === true ? best : null;
}

/**
 * Cascade dynamique : a chaque point de timeline, le meilleur modele
 * eligible. Si `preferred` est fourni (choix manuel de l'utilisateur), il
 * est retenu partout ou il est eligible, et la selection automatique
 * reprend au-dela de sa portee : la transition reste visible.
 *
 * Pour eviter des allers-retours d'un point a l'autre quand deux scores
 * sont tres proches, le modele du segment precedent est conserve tant que
 * son ecart au meilleur reste inferieur a `hysteresisPoints`.
 */
export function buildSelectedCascade(input: {
  readonly timeline: readonly LocalIsoHour[];
  readonly now: Date;
  readonly context: SelectionContext;
  readonly preferred?: ModelId | null;
  readonly hysteresisPoints?: number;
  /**
   * Couverture reelle : le modele a-t-il une valeur a cet index ? La portee
   * nominale du catalogue ne suffit pas, une execution recente ou tardive
   * decale la fin des donnees de plusieurs heures.
   */
  readonly hasData?: (model: ModelId, index: number) => boolean;
}): readonly CascadeSegment[] {
  const hysteresis = input.hysteresisPoints ?? 0.5;
  const hasData = input.hasData ?? (() => true);
  const segments: CascadeSegment[] = [];
  for (const [index, point] of input.timeline.entries()) {
    const lead = leadHoursFrom(input.now, point);
    if (lead < 0) {
      continue;
    }
    const ranking = rankModels(input.context, lead).filter(
      (r) => r.eligible && hasData(r.model, index),
    );
    const best = ranking[0];
    if (best === undefined) {
      continue;
    }
    let model = best.model;
    const preferred = input.preferred ?? null;
    if (preferred !== null && ranking.some((r) => r.model === preferred)) {
      model = preferred;
    } else {
      const last = segments.at(-1);
      const incumbent =
        last !== undefined && last.endIndex === index - 1
          ? ranking.find((r) => r.model === last.model)
          : undefined;
      if (incumbent !== undefined && best.score - incumbent.score < hysteresis) {
        model = incumbent.model;
      }
    }
    const last = segments.at(-1);
    if (last !== undefined && last.model === model && last.endIndex === index - 1) {
      segments[segments.length - 1] = { ...last, endIndex: index };
    } else {
      segments.push({ model, startIndex: index, endIndex: index });
    }
  }
  return segments;
}

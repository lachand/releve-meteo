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
}

export type CriterionKind = 'resolution' | 'mediumRange' | 'localSkill';

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
  localSkill: 6,
  /** Echelle de decroissance du poids de la maille avec l'echeance, heures. */
  resolutionDecayHours: 60,
  /** Nombre d'echantillons pour lequel la mesure locale pese a moitie. */
  shrinkageSamples: 15,
} as const;

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
    const relative = Math.max(-1, Math.min(1, (peerMae - own.stats.mae) / peerMae));
    const shrink = own.sampleCount / (own.sampleCount + SELECTION_WEIGHTS.shrinkageSamples);
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

/** Classement complet des modeles pour une echeance, du meilleur au moins bon. */
export function rankModels(context: SelectionContext, leadHours: number): readonly ModelRanking[] {
  const rankings = MODEL_ORDER.map((model): ModelRanking => {
    const ineligibility = eligibility(model, leadHours, context);
    const weight = resolutionWeight(leadHours);
    const spec = MODEL_SPECS[model];
    const criteria: Criterion[] = [
      {
        kind: 'resolution',
        points: SELECTION_WEIGHTS.resolution * weight * terrainFit(model, context.terrain),
        detail: { resolutionKm: spec.resolutionKm, terrain: context.terrain, leadHours },
      },
      {
        kind: 'mediumRange',
        points: SELECTION_WEIGHTS.mediumRange * (1 - weight) * MEDIUM_RANGE_QUALITY[model],
        detail: { leadHours },
      },
      ...localSkillCriteria(model, leadHours, context.verification),
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

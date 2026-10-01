import type { LeadScores } from '../domain/leadScores';
import { blendedPointAt, modelAt, transitionIndices } from '../domain/modelCascade';
import type { BlendedPoint, CascadeSegment } from '../domain/modelCascade';
import { MODEL_ORDER } from '../domain/models';
import { buildSelectedCascade, explainSwitch, rankModels } from '../domain/modelSelection';
import type { ModelRanking, SelectionContext, SwitchReason } from '../domain/modelSelection';
import type { ModelVerification } from '../domain/reliability';
import { indexOfNow, leadHoursFrom } from '../domain/time';
import type { ForecastBundle, ModelId, TerrainProfile } from '../domain/types';

/*
 * Cascade de modeles d'un bundle, sans React : partagee par la page (via
 * useCascadeView) et par le service worker (veille en arriere-plan), pour
 * que la notification nomme le meme modele que le releve.
 */

/** Une bascule de modele a un index de timeline, avec sa raison chiffree. */
export type CascadeSwitch = SwitchReason & { readonly index: number };

export interface CascadeView {
  readonly segments: readonly CascadeSegment[];
  /** Points de cascade par index de timeline ; null hors cascade (passe, ou aucun modele). */
  readonly points: readonly (BlendedPoint | null)[];
  readonly transitions: readonly number[];
  /** Les memes bascules que `transitions`, avec la raison de chacune. */
  readonly switches: readonly CascadeSwitch[];
  readonly nowIndex: number;
  readonly activeModel: ModelId | null;
  /** Modeles presents dans le bundle, pas seulement ceux qui gagnent un segment de cascade. */
  readonly available: readonly ModelId[];
  /** Classement complet a l'instant present, pour la justification. */
  readonly rankingNow: readonly ModelRanking[];
  readonly context: SelectionContext;
  /** Choix manuel en vigueur, ou null en selection automatique. */
  readonly preferred: ModelId | null;
}

export interface CascadeInputs {
  readonly terrain: TerrainProfile | null;
  readonly verification: readonly ModelVerification[];
  readonly preferred: ModelId | null;
  /** Notes de 1 a 12 h (instantanes enregistres) ; absentes ou en collecte, sans effet. */
  readonly shortLead?: LeadScores;
  /** Injectable pour les tests ; par defaut l'instant du calcul. */
  readonly now?: Date;
}

/** Cascade a partir de valeurs deja connues, sans React. Exportee pour les tests. */
export function computeCascadeView(
  bundle: ForecastBundle,
  inputs: CascadeInputs,
  now: Date,
): CascadeView {
  const available = MODEL_ORDER.filter((model) => bundle.series[model] !== undefined);
  const context: SelectionContext = {
    latitude: bundle.place.latitude,
    longitude: bundle.place.longitude,
    terrain: inputs.terrain?.kind ?? 'plain',
    available,
    verification: inputs.verification,
    ...(inputs.shortLead === undefined ? {} : { shortLead: inputs.shortLead }),
  };
  const hasData = (model: ModelId, index: number): boolean => {
    const value = bundle.series[model]?.hourly[index]?.temperature.value;
    return value !== undefined && value !== null;
  };
  const segments = buildSelectedCascade({
    timeline: bundle.timeline,
    now,
    context,
    preferred: inputs.preferred,
    hasData,
  });
  const switches = segments.slice(1).map((segment, k): CascadeSwitch => {
    // `k` indexe `segments.slice(1)` : le segment precedent est `segments[k]`.
    const previous = segments[k];
    const time = bundle.timeline[segment.startIndex];
    return {
      ...explainSwitch({
        context,
        from: previous?.model ?? segment.model,
        to: segment.model,
        leadHours: time === undefined ? 0 : Math.max(0, leadHoursFrom(now, time)),
        preferred: inputs.preferred,
        fromHasData: previous === undefined || hasData(previous.model, segment.startIndex),
      }),
      index: segment.startIndex,
    };
  });
  const nowIndex = indexOfNow(bundle.timeline, now);
  const nowTime = nowIndex === -1 ? undefined : bundle.timeline[nowIndex];
  return {
    segments,
    points: bundle.timeline.map((_, index) => blendedPointAt(bundle, segments, index)),
    transitions: transitionIndices(segments),
    switches,
    nowIndex,
    activeModel: nowIndex === -1 ? null : modelAt(segments, nowIndex),
    available,
    rankingNow: rankModels(
      context,
      nowTime === undefined ? 0 : Math.max(0, leadHoursFrom(now, nowTime)),
    ),
    context,
    preferred: inputs.preferred,
  };
}

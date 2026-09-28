import { useMemo } from 'react';
import { blendedPointAt, modelAt, transitionIndices } from '../../domain/modelCascade';
import type { BlendedPoint, CascadeSegment } from '../../domain/modelCascade';
import { MODEL_ORDER } from '../../domain/models';
import { buildSelectedCascade, rankModels } from '../../domain/modelSelection';
import type { ModelRanking, SelectionContext } from '../../domain/modelSelection';
import type { ModelVerification } from '../../domain/reliability';
import { indexOfNow, leadHoursFrom } from '../../domain/time';
import type { ForecastBundle, ModelId, TerrainProfile } from '../../domain/types';

export interface CascadeView {
  readonly segments: readonly CascadeSegment[];
  /** Points de cascade par index de timeline ; null hors cascade (passe, ou aucun modele). */
  readonly points: readonly (BlendedPoint | null)[];
  readonly transitions: readonly number[];
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
  };
  const segments = buildSelectedCascade({
    timeline: bundle.timeline,
    now,
    context,
    preferred: inputs.preferred,
    hasData: (model, index) => {
      const value = bundle.series[model]?.hourly[index]?.temperature.value;
      return value !== undefined && value !== null;
    },
  });
  const nowIndex = indexOfNow(bundle.timeline, now);
  const nowTime = nowIndex === -1 ? undefined : bundle.timeline[nowIndex];
  return {
    segments,
    points: bundle.timeline.map((_, index) => blendedPointAt(bundle, segments, index)),
    transitions: transitionIndices(segments),
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

/**
 * Recalcule la cascade active pour un bundle, memorisee entre rendus. Le
 * terrain, la verification locale et le choix manuel influencent la
 * selection ; `now` ne la recalcule pas a lui seul.
 */
export function useCascadeView(
  bundle: ForecastBundle | null,
  inputs: CascadeInputs,
): CascadeView | null {
  const { terrain, verification, preferred } = inputs;
  return useMemo(() => {
    if (bundle === null) {
      return null;
    }
    return computeCascadeView(
      bundle,
      { terrain, verification, preferred },
      inputs.now ?? new Date(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` change a chaque rendu par defaut ; seuls les intrants de selection doivent recalculer la cascade.
  }, [bundle, terrain, verification, preferred]);
}

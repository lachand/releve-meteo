import { useMemo } from 'react';
import { buildCascade, blendByCascade, transitionIndices } from '../../domain/modelCascade';
import type { CascadeSegment } from '../../domain/modelCascade';
import { indexOfNow } from '../../domain/time';
import type { ForecastBundle, HourlyPoint, ModelId } from '../../domain/types';

const CASCADE_ORDER: readonly ModelId[] = ['arome', 'arpege', 'icon_eu', 'gfs'];

export interface CascadeView {
  readonly segments: readonly CascadeSegment[];
  readonly blended: readonly (HourlyPoint & { readonly model: ModelId })[];
  readonly transitions: readonly number[];
  readonly nowIndex: number;
  readonly activeModel: ModelId | null;
  /** Modeles presents dans le bundle, pas seulement ceux qui gagnent un segment de cascade. */
  readonly available: readonly ModelId[];
}

function modelAt(segments: readonly CascadeSegment[], index: number): ModelId | null {
  const segment = segments.find((s) => index >= s.startIndex && index <= s.endIndex);
  return segment?.model ?? null;
}

/**
 * Recalcule la cascade active pour un bundle, memorise entre rendus.
 * `now` est injectable (comme dans tout le domaine) pour rendre le calcul
 * testable ; par defaut l'instant reel au moment du rendu.
 */
export function useCascadeView(
  bundle: ForecastBundle | null,
  now: Date = new Date(),
): CascadeView | null {
  return useMemo(() => {
    if (bundle === null) {
      return null;
    }
    const available = CASCADE_ORDER.filter((model) => bundle.series[model] !== undefined);
    const segments = buildCascade(bundle.timeline, now, available);
    const blended = blendByCascade(bundle, segments);
    const nowIndex = indexOfNow(bundle.timeline, now);
    return {
      segments,
      blended,
      transitions: transitionIndices(segments),
      nowIndex,
      activeModel: nowIndex === -1 ? null : modelAt(segments, nowIndex),
      available,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` change a chaque rendu par defaut ; seul un changement de bundle doit recalculer la cascade.
  }, [bundle]);
}

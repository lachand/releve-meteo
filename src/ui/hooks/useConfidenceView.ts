import { useMemo } from 'react';
import { confidenceAt } from '../../domain/confidence';
import type { ConfidenceVerdict } from '../../domain/confidence';
import type { ForecastBundle, TerrainProfile } from '../../domain/types';

/** Un verdict de confiance par index de timeline, memorise entre rendus. */
export function useConfidenceView(
  bundle: ForecastBundle | null,
  terrain: TerrainProfile | null,
): readonly ConfidenceVerdict[] | null {
  return useMemo(() => {
    if (bundle === null || terrain === null) {
      return null;
    }
    return bundle.timeline.map((_, index) => confidenceAt(bundle, index, terrain));
  }, [bundle, terrain]);
}

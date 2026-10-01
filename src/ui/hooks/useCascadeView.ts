import { useMemo } from 'react';
import type { ForecastBundle } from '../../domain/types';
import { computeCascadeView } from '../cascadeView';
import type { CascadeInputs, CascadeView } from '../cascadeView';

export { computeCascadeView } from '../cascadeView';
export type { CascadeInputs, CascadeView } from '../cascadeView';

/**
 * Recalcule la cascade active pour un bundle, memorisee entre rendus. Le
 * terrain, la verification locale et le choix manuel influencent la
 * selection ; `now` ne la recalcule pas a lui seul.
 */
export function useCascadeView(
  bundle: ForecastBundle | null,
  inputs: CascadeInputs,
): CascadeView | null {
  const { terrain, verification, preferred, shortLead } = inputs;
  return useMemo(() => {
    if (bundle === null) {
      return null;
    }
    return computeCascadeView(
      bundle,
      { terrain, verification, preferred, shortLead },
      inputs.now ?? new Date(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` change a chaque rendu par defaut ; seuls les intrants de selection doivent recalculer la cascade.
  }, [bundle, terrain, verification, preferred, shortLead]);
}

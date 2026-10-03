import type { Place } from '../domain/types';
import { parseSharedPlace } from './sharedPlace';

/**
 * Le lieu sur lequel l'application s'ouvre. Dans l'ordre : le lieu de l'adresse (lien partage,
 * clic sur un widget), le dernier lieu ouvert, le premier favori ; sinon la page de recherche.
 */
export function startingPlace(
  search: string,
  last: Place | null,
  favourites: readonly Place[],
): Place | null {
  return parseSharedPlace(search) ?? last ?? favourites[0] ?? null;
}

import type { Place } from '../../domain/types';

/*
 * Le dernier lieu ouvert, pour que l'application rouvre dessus au lieu de la page de recherche.
 * Une cle a part, pas dans les preferences : ce n'est pas un reglage, et une lecture ratee ne doit
 * jamais toucher aux favoris.
 */

const STORAGE_KEY = 'meteo-fr:last-place';

// Repli en memoire quand localStorage est indisponible (mode prive strict, quota).
let memoryFallback: Place | null = null;

function isPlace(value: unknown): value is Place {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const place = value as Record<string, unknown>;
  return (
    typeof place.id === 'string' &&
    typeof place.name === 'string' &&
    place.name.trim() !== '' &&
    typeof place.latitude === 'number' &&
    Number.isFinite(place.latitude) &&
    typeof place.longitude === 'number' &&
    Number.isFinite(place.longitude) &&
    typeof place.elevation === 'number' &&
    Number.isFinite(place.elevation) &&
    (place.admin === null || typeof place.admin === 'string') &&
    (place.alias === null || typeof place.alias === 'string')
  );
}

export function readLastPlace(): Place | null {
  if (memoryFallback !== null) {
    return memoryFallback;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isPlace(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLastPlace(place: Place): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
    memoryFallback = null;
  } catch {
    memoryFallback = place;
  }
}

/** Reinitialise le repli memoire. Utilise par les tests. */
export function resetMemoryLastPlaceForTests(): void {
  memoryFallback = null;
}

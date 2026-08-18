import { isWithinMetropolitanFrance } from '../domain/terrain';
import type { Place } from '../domain/types';

const COORDINATE_DECIMALS = 4;

function placeId(latitude: number, longitude: number): string {
  return `${latitude.toFixed(COORDINATE_DECIMALS)}:${longitude.toFixed(COORDINATE_DECIMALS)}`;
}

/**
 * Lit `?lat=&lon=` depuis une chaine de recherche d'URL (TESTING.md 5.5).
 * Retourne null si les parametres sont absents, non numeriques, ou hors
 * metropole : une coordonnee hors perimetre n'a pas de prevision a offrir.
 */
export function parseSharedPlace(search: string): Place | null {
  const params = new URLSearchParams(search);
  const rawLat = params.get('lat');
  const rawLon = params.get('lon');
  if (rawLat === null || rawLon === null) {
    return null;
  }
  const latitude = Number(rawLat);
  const longitude = Number(rawLon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (!isWithinMetropolitanFrance(latitude, longitude)) {
    return null;
  }
  return {
    id: placeId(latitude, longitude),
    name: 'Lieu partagé',
    latitude,
    longitude,
    elevation: 0,
    admin: null,
    alias: null,
  };
}

/** Chaine de recherche `?lat=&lon=` a placer dans l'URL courante pour partager ce lieu. */
export function sharedPlaceSearch(place: Place): string {
  return `?lat=${place.latitude}&lon=${place.longitude}`;
}

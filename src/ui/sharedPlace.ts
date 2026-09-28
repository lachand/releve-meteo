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
  const name = params.get('nom');
  const altitude = Number(params.get('alt'));
  return {
    id: placeId(latitude, longitude),
    name: name !== null && name.trim() !== '' ? name.trim().slice(0, 80) : 'Lieu partagé',
    latitude,
    longitude,
    // Altitude absente d'un lien ancien : 0 par defaut, comme avant ; elle
    // sert au classement du terrain et au choix de la station de reference.
    elevation: params.get('alt') !== null && Number.isFinite(altitude) ? altitude : 0,
    admin: params.get('dep'),
    alias: null,
  };
}

/**
 * Chaine de recherche a placer dans l'URL courante pour partager ce lieu :
 * coordonnees, nom, altitude et departement, puis la vue ouverte.
 */
export function sharedPlaceSearch(place: Place, view?: string): string {
  const params = new URLSearchParams();
  params.set('lat', String(place.latitude));
  params.set('lon', String(place.longitude));
  params.set('nom', place.name);
  params.set('alt', String(Math.round(place.elevation)));
  if (place.admin !== null) {
    params.set('dep', place.admin);
  }
  if (view !== undefined) {
    params.set('vue', view);
  }
  return `?${params.toString()}`;
}

/** Vue demandee par `?vue=`, ou null. */
export function sharedView(search: string): string | null {
  return new URLSearchParams(search).get('vue');
}

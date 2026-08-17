import { TERRAIN_THRESHOLDS } from './constants';
import { METROPOLITAN_FRANCE_RINGS } from './franceBoundary';
import type { TerrainKind, TerrainProfile } from './types';

export interface CoastlinePoint {
  readonly lat: number;
  readonly lon: number;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLambda / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

/** Distance orthodromique au point de littoral le plus proche, en km. */
export function distanceToCoastKm(
  latitude: number,
  longitude: number,
  coastline: readonly CoastlinePoint[],
): number {
  let nearest = Infinity;
  for (const point of coastline) {
    const distance = haversineKm(latitude, longitude, point.lat, point.lon);
    if (distance < nearest) {
      nearest = distance;
    }
  }
  return nearest;
}

// Algorithme du rayon (ray casting) sur un anneau [longitude, latitude].
// Les rings de METROPOLITAN_FRANCE_RINGS sont une constante non vide
// generee a la construction : le seul point d'entree "vide" n'est pas
// atteignable en pratique.
function pointInRing(
  lon: number,
  lat: number,
  ring: readonly (readonly [number, number])[],
): boolean {
  let inside = false;
  let previous = ring.at(-1);
  /* v8 ignore next 3 */
  if (previous === undefined) {
    return false;
  }
  for (const current of ring) {
    const [xi, yi] = previous;
    const [xj, yj] = current;
    if (yi > lat !== yj > lat) {
      const xIntersect = xi + ((lat - yi) * (xj - xi)) / (yj - yi);
      if (lon < xIntersect) {
        inside = !inside;
      }
    }
    previous = current;
  }
  return inside;
}

/** Bounding box metropole + verification fine. Corse incluse. */
export function isWithinMetropolitanFrance(latitude: number, longitude: number): boolean {
  return METROPOLITAN_FRANCE_RINGS.some((ring) => pointInRing(longitude, latitude, ring));
}

function classifyKind(elevation: number, distanceToCoastKm: number): TerrainKind {
  if (distanceToCoastKm < TERRAIN_THRESHOLDS.coastalDistanceKm) {
    return 'coastal';
  }
  if (elevation > TERRAIN_THRESHOLDS.mountainElevationM) {
    return 'mountain';
  }
  if (elevation > TERRAIN_THRESHOLDS.plateauElevationM) {
    return 'plateau';
  }
  return 'plain';
}

/**
 * Priorite des regles, dans cet ordre strict:
 *   1. distanceToCoastKm < 10  -> 'coastal'  (prime sur l'altitude)
 *   2. elevation > 900         -> 'mountain'
 *   3. elevation > 300         -> 'plateau'
 *   4. sinon                   -> 'plain'
 * Comparaisons strictes: 900 m exactement n'est pas 'mountain'.
 */
export function classifyTerrain(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number;
  readonly distanceToCoastKm: number;
}): TerrainProfile {
  return {
    kind: classifyKind(input.elevation, input.distanceToCoastKm),
    elevation: input.elevation,
    distanceToCoastKm: input.distanceToCoastKm,
  };
}

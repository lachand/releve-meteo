/*
 * Departement d'un lieu, retrouve hors ligne sur les contours simplifies
 * de public/data/departements-fr.json (IGN Admin Express, Licence
 * Ouverte) : la vigilance Meteo-France est publiee par departement, et un
 * lieu venu du GPS n'a pas de nom de departement.
 */

export interface Department {
  /** Code INSEE : '01' a '95', '2A', '2B'. */
  readonly code: string;
  readonly name: string;
  /** Anneaux exterieurs, [longitude, latitude]. */
  readonly rings: readonly (readonly (readonly [number, number])[])[];
}

/**
 * Au-dela de cette distance du contour le plus proche, un point hors de
 * tout departement (en mer) n'est rattache a aucun : les contours sont
 * simplifies a environ 1 km.
 */
export const DEPARTMENT_FALLBACK_KM = 3;

/** Lancer de rayon : le point est-il dans l'anneau ? */
function insideRing(
  latitude: number,
  longitude: number,
  ring: Department['rings'][number],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    // Indices bornes par la boucle : garde pour le typage seulement.
    /* v8 ignore next 3 */
    if (a === undefined || b === undefined) {
      continue;
    }
    const [xi, yi] = a;
    const [xj, yj] = b;
    if (yi > latitude !== yj > latitude) {
      const crossing = ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;
      if (longitude < crossing) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** Distance du point au contour le plus proche, km (projection locale equirectangulaire). */
function distanceToContourKm(latitude: number, longitude: number, department: Department): number {
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos((latitude * Math.PI) / 180);
  let best = Infinity;
  for (const ring of department.rings) {
    for (let i = 0; i + 1 < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[i + 1];
      // Indices bornes par la boucle : garde pour le typage seulement.
      /* v8 ignore next 3 */
      if (a === undefined || b === undefined) {
        continue;
      }
      // Coordonnees en km, origine au point cherche.
      const ax = (a[0] - longitude) * kmPerDegLon;
      const ay = (a[1] - latitude) * kmPerDegLat;
      const bx = (b[0] - longitude) * kmPerDegLon;
      const by = (b[1] - latitude) * kmPerDegLat;
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

/**
 * Departement qui contient le point ; a defaut (point juste au large d'un
 * contour simplifie), le plus proche a moins de DEPARTMENT_FALLBACK_KM ;
 * sinon null.
 */
export function departmentAt(
  latitude: number,
  longitude: number,
  departments: readonly Department[],
): Department | null {
  const containing = departments.find((department) =>
    department.rings.some((ring) => insideRing(latitude, longitude, ring)),
  );
  if (containing !== undefined) {
    return containing;
  }
  let nearest: Department | null = null;
  let nearestKm = DEPARTMENT_FALLBACK_KM;
  for (const department of departments) {
    const distance = distanceToContourKm(latitude, longitude, department);
    if (distance <= nearestKm) {
      nearest = department;
      nearestKm = distance;
    }
  }
  return nearest;
}

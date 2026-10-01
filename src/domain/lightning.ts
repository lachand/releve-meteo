/*
 * Foudre observee : image d'eclairs accumules par le satellite MTG (imageur
 * d'eclairs LI, produit « Accumulated Flash Area » d'EUMETSAT), une image tous
 * les 5 minutes. Cette couche ne calcule rien d'autre que le decoupage : les
 * instants des images et la zone demandee. Le temps courant est un parametre.
 */

export const LIGHTNING = {
  /** Images de la boucle : deux heures a 5 minutes. */
  frames: 24,
  stepMinutes: 5,
  /** Demi-cote de la zone, km : 600 km de cote autour du lieu. */
  halfExtentKm: 300,
} as const;

const KM_PER_DEGREE_LATITUDE = 111.32;
const EARTH_RADIUS_M = 6378137;

/**
 * Instants des images, du plus ancien au plus recent, en millisecondes UTC.
 * Le dernier est `latestMs` : l'image la plus recente publiee, jamais un
 * instant calcule d'apres l'horloge locale.
 */
export function lightningFrameTimes(
  latestMs: number,
  count: number = LIGHTNING.frames,
  stepMinutes: number = LIGHTNING.stepMinutes,
): readonly number[] {
  return Array.from(
    { length: count },
    (_, index) => latestMs - (count - 1 - index) * stepMinutes * 60_000,
  );
}

/** Position en projection Web Mercator (EPSG:3857), metres. */
export function mercatorPoint(latitude: number, longitude: number): { x: number; y: number } {
  return {
    x: (EARTH_RADIUS_M * longitude * Math.PI) / 180,
    y: EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)),
  };
}

export interface LightningArea {
  /** Coins geographiques, degres : la zone vue par la carte. */
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
  /** La meme zone en Web Mercator, metres, pour la requete d'image. */
  readonly mercator: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  /** Taille de l'image demandee, pixels : la zone n'est pas carree en Mercator. */
  readonly width: number;
  readonly height: number;
}

/** Zone carree autour du lieu et taille d'image proportionnelle, `width` pixels de large. */
export function lightningArea(
  center: { readonly latitude: number; readonly longitude: number },
  halfExtentKm: number = LIGHTNING.halfExtentKm,
  width = 640,
): LightningArea {
  const halfLat = halfExtentKm / KM_PER_DEGREE_LATITUDE;
  const halfLon =
    halfExtentKm / (KM_PER_DEGREE_LATITUDE * Math.cos((center.latitude * Math.PI) / 180));
  const south = center.latitude - halfLat;
  const north = center.latitude + halfLat;
  const west = center.longitude - halfLon;
  const east = center.longitude + halfLon;
  const lowerLeft = mercatorPoint(south, west);
  const upperRight = mercatorPoint(north, east);
  const mercator = {
    minX: lowerLeft.x,
    minY: lowerLeft.y,
    maxX: upperRight.x,
    maxY: upperRight.y,
  };
  const ratio = (mercator.maxY - mercator.minY) / (mercator.maxX - mercator.minX);
  return { south, west, north, east, mercator, width, height: Math.round(width * ratio) };
}

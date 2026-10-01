import { haversineKm } from './terrain';

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

/** Position geographique d'un point Web Mercator (EPSG:3857), metres. */
export function inverseMercator(x: number, y: number): { latitude: number; longitude: number } {
  return {
    latitude: ((2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) * 180) / Math.PI,
    longitude: (x / EARTH_RADIUS_M) * (180 / Math.PI),
  };
}

/** Surveillance des eclairs a proximite d'un lieu (veille en arriere-plan). */
export const LIGHTNING_WATCH = {
  /** Distance, km, en deca de laquelle un eclair est dit « a proximite ». */
  radiusKm: 30,
  /** Demi-cote de la zone lue, km : un peu plus que le rayon, pour les bords. */
  halfExtentKm: 32,
  /** Largeur de l'image lue, pixels : environ 1 km par pixel. */
  width: 64,
  /** Images lues, les plus recentes : 15 minutes. */
  frames: 3,
} as const;

/** Pixels d'une image qui portent au moins un eclair, ligne par ligne, du nord au sud. */
export interface ActiveMask {
  readonly width: number;
  readonly height: number;
  readonly active: readonly boolean[];
}

export interface LightningNear {
  /** Pixels actifs a proximite, sans doublon d'une image a l'autre. */
  readonly cells: number;
  /** Distance du plus proche, km. */
  readonly nearestKm: number;
  /** Premiere et derniere images (epoch ms) ou des eclairs ont ete vus a proximite. */
  readonly firstTime: number;
  readonly lastTime: number;
}

/**
 * Eclairs observes a moins de `radiusKm` du lieu sur les images donnees, ou
 * null s'il n'y en a pas. Le centre de chaque pixel est situe avec la
 * projection de la requete ; une image vide n'est pas une erreur, c'est
 * l'absence d'eclair detecte.
 */
export function lightningNear(input: {
  readonly center: { readonly latitude: number; readonly longitude: number };
  readonly area: LightningArea;
  readonly frames: readonly { readonly time: number; readonly mask: ActiveMask }[];
  readonly radiusKm?: number;
}): LightningNear | null {
  const radius = input.radiusKm ?? LIGHTNING_WATCH.radiusKm;
  const { minX, minY, maxX, maxY } = input.area.mercator;
  const cells = new Map<string, number>();
  let first = Infinity;
  let last = -Infinity;
  for (const { time, mask } of input.frames) {
    let hit = false;
    mask.active.forEach((isActive, index) => {
      if (!isActive) {
        return;
      }
      const row = Math.floor(index / mask.width);
      const col = index % mask.width;
      const point = inverseMercator(
        minX + ((col + 0.5) / mask.width) * (maxX - minX),
        maxY - ((row + 0.5) / mask.height) * (maxY - minY),
      );
      const distance = haversineKm(
        input.center.latitude,
        input.center.longitude,
        point.latitude,
        point.longitude,
      );
      if (distance <= radius) {
        cells.set(`${row}:${col}`, Math.min(distance, cells.get(`${row}:${col}`) ?? Infinity));
        hit = true;
      }
    });
    if (hit) {
      first = Math.min(first, time);
      last = Math.max(last, time);
    }
  }
  if (cells.size === 0) {
    return null;
  }
  return {
    cells: cells.size,
    nearestKm: Math.min(...cells.values()),
    firstTime: first,
    lastTime: last,
  };
}

/*
 * Cartes hors ligne : quelles tuiles OpenStreetMap telecharger a l'avance
 * autour des favoris. OpenStreetMap demande un usage mesure et decourage le
 * telechargement en masse : le plan est donc petit, plafonne, et lance par
 * l'utilisateur seulement.
 */

export const TILE_PLAN = {
  /** Zooms couverts : la region, puis le voisinage. */
  zooms: [8, 9, 10],
  /** Tuiles de part et d'autre de la tuile du lieu. */
  radius: 1,
  /** Plafond de tuiles par telechargement. */
  maxTiles: 120,
  /** Favoris pris en compte, dans leur ordre. */
  maxPlaces: 4,
  /** Poids moyen d'une tuile, octets : une estimation, pas une mesure. */
  averageBytes: 15_000,
} as const;

export interface Tile {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** Tuile OpenStreetMap (projection Web Mercator) qui contient un point. */
export function tileXY(latitude: number, longitude: number, zoom: number): Tile {
  const n = 2 ** zoom;
  const x = Math.floor(((longitude + 180) / 360) * n);
  const latRad = (latitude * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { z: zoom, x, y };
}

export interface TilePlan {
  readonly tiles: readonly Tile[];
  /** Vrai quand le plafond a laisse des tuiles de cote. */
  readonly truncated: boolean;
}

/**
 * Tuiles a telecharger : pour chaque lieu et chaque zoom, la tuile du lieu et
 * son voisinage. Sans doublon, premier lieu d'abord, plafonne a `maxTiles`.
 */
export function tilePlan(input: {
  readonly places: readonly { readonly latitude: number; readonly longitude: number }[];
  readonly zooms: readonly number[];
  readonly radius: number;
  readonly maxTiles: number;
}): TilePlan {
  const seen = new Set<string>();
  const tiles: Tile[] = [];
  let truncated = false;
  for (const place of input.places) {
    for (const zoom of input.zooms) {
      const centre = tileXY(place.latitude, place.longitude, zoom);
      const last = 2 ** zoom - 1;
      for (let dy = -input.radius; dy <= input.radius; dy += 1) {
        for (let dx = -input.radius; dx <= input.radius; dx += 1) {
          const x = centre.x + dx;
          const y = centre.y + dy;
          const key = `${zoom}/${x}/${y}`;
          if (x < 0 || y < 0 || x > last || y > last || seen.has(key)) {
            continue;
          }
          if (tiles.length >= input.maxTiles) {
            truncated = true;
            continue;
          }
          seen.add(key);
          tiles.push({ z: zoom, x, y });
        }
      }
    }
  }
  return { tiles, truncated };
}

/** Adresse d'une tuile d'apres un gabarit `{z}/{x}/{y}`. */
export function tileUrl(template: string, tile: Tile): string {
  return template
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y));
}

/** Poids estime d'un telechargement, octets. */
export function estimateTileBytes(count: number): number {
  return count * TILE_PLAN.averageBytes;
}

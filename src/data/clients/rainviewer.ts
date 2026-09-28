import { request } from './http';
import type { HttpResult } from './http';

export interface RadarFrame {
  readonly time: number; // epoch secondes UTC
  /** Gabarit d'URL de tuile avec {z}/{x}/{y} a substituer, deja complet sinon. */
  readonly tileUrlTemplate: string;
}

/**
 * Trame d'animation : les trames passees sont des observations radar, les
 * trames de nowcast une extrapolation, qui le disent (AGENTS.md regle 7).
 * L'API gratuite ne publie plus de nowcast depuis 2026 (liste vide,
 * constate le 2026-09-28) : le cas reste gere si elle en republie.
 */
export interface RadarAnimationFrame extends RadarFrame {
  readonly provenance: 'observed' | 'forecast';
}

interface RawFrame {
  readonly time: number;
  readonly path: string;
}

interface RawWeatherMapsResponse {
  readonly host: string;
  readonly radar?: {
    readonly past?: readonly RawFrame[];
    readonly nowcast?: readonly RawFrame[];
  };
}

const WEATHER_MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';

// Non documente dans ARCHITECTURE.md section 2 (pas dans l'arborescence du
// Lot 0) : ce client suit neanmoins le meme patron que les autres (request
// + HttpResult), pas de logique de fetch dans ui/, pour une seule requete
// JSON legere sans mise en cache IndexedDB (les horodatages de trame n'ont
// de sens que rafraichis).
/**
 * Tuiles de 512 px : au zoom 7, plafond de l'API gratuite, elles ont la
 * densite d'une tuile de 256 px au zoom 8, sans agrandissement.
 */
export const RAINVIEWER_TILE_SIZE = 512;
const TILE_SIZE = RAINVIEWER_TILE_SIZE;
/**
 * Zoom maximal des tuiles de l'API gratuite RainViewer : au-dela, le
 * serveur renvoie une image « Zoom Level Not Supported » (constate le
 * 2026-09-28). Les cartes plus zoomees agrandissent les tuiles de ce zoom.
 */
export const RAINVIEWER_MAX_NATIVE_ZOOM = 7;
// Palette 2 (Universal Blue) : lisible sur le fond clair et sombre de
// DESIGN.md, sans devoir la reimplementer nous-memes.
const COLOR_SCHEME = 2;
const SMOOTH = 1;
const SNOW = 1;

function tileTemplate(host: string, frame: RawFrame): string {
  return `${host}${frame.path}/${TILE_SIZE}/{z}/{x}/{y}/${COLOR_SCHEME}/${SMOOTH}_${SNOW}.png`;
}

/**
 * Toutes les trames publiees : les deux dernieres heures observees (pas de
 * 10 min), puis le nowcast, dans l'ordre chronologique.
 */
export async function fetchRadarFrames(
  signal?: AbortSignal,
): Promise<HttpResult<readonly RadarAnimationFrame[]>> {
  const result = await request<RawWeatherMapsResponse>(WEATHER_MAPS_URL, { signal });
  if (!result.ok) {
    return result;
  }
  const { host, radar } = result.value;
  const frames: RadarAnimationFrame[] = [
    ...(radar?.past ?? []).map((frame) => ({
      time: frame.time,
      tileUrlTemplate: tileTemplate(host, frame),
      provenance: 'observed' as const,
    })),
    ...(radar?.nowcast ?? []).map((frame) => ({
      time: frame.time,
      tileUrlTemplate: tileTemplate(host, frame),
      provenance: 'forecast' as const,
    })),
  ];
  return { ok: true, value: frames.sort((a, b) => a.time - b.time) };
}

import { request } from './http';
import type { HttpResult } from './http';

export interface RadarFrame {
  readonly time: number; // epoch secondes UTC
  /** Gabarit d'URL de tuile avec {z}/{x}/{y} a substituer, deja complet sinon. */
  readonly tileUrlTemplate: string;
}

/**
 * Trame d'animation : les trames passees sont des observations radar, les
 * trames de nowcast sont une extrapolation (prevision a 30 min) et le
 * disent (AGENTS.md regle 7).
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
const TILE_SIZE = 256;
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

/** Derniere trame radar disponible, ou `null` si RainViewer n'en publie aucune. */
export async function fetchLatestRadarFrame(
  signal?: AbortSignal,
): Promise<HttpResult<RadarFrame | null>> {
  const result = await request<RawWeatherMapsResponse>(WEATHER_MAPS_URL, { signal });
  if (!result.ok) {
    return result;
  }
  const frames = result.value.radar?.past ?? [];
  const latest = frames.at(-1);
  if (latest === undefined) {
    return { ok: true, value: null };
  }
  return {
    ok: true,
    value: { time: latest.time, tileUrlTemplate: tileTemplate(result.value.host, latest) },
  };
}

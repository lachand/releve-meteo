import { request } from './http';
import type { HttpResult } from './http';

export interface RadarFrame {
  readonly time: number; // epoch secondes UTC
  /** Gabarit d'URL de tuile avec {z}/{x}/{y} a substituer, deja complet sinon. */
  readonly tileUrlTemplate: string;
}

interface RawFrame {
  readonly time: number;
  readonly path: string;
}

interface RawWeatherMapsResponse {
  readonly host: string;
  readonly radar?: { readonly past?: readonly RawFrame[] };
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
  const { host } = result.value;
  return {
    ok: true,
    value: {
      time: latest.time,
      tileUrlTemplate: `${host}${latest.path}/${TILE_SIZE}/{z}/{x}/{y}/${COLOR_SCHEME}/${SMOOTH}_${SNOW}.png`,
    },
  };
}

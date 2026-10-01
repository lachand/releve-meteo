import { LIGHTNING, lightningArea, lightningFrameTimes } from '../../domain/lightning';
import type { LightningArea } from '../../domain/lightning';
import { requestText } from './http';
import type { HttpResult } from './http';

/*
 * Foudre observee : imageur d'eclairs LI du satellite MTG, produit
 * « Accumulated Flash Area » diffuse par le service WMS EUMETView
 * d'EUMETSAT. Sans cle, avec en-tetes CORS ouverts (constate le 2026-10-01).
 * Une image tous les 5 minutes ; l'instant de la derniere est lu dans les
 * capacites du service, jamais deduit de l'horloge locale.
 */

const WMS_URL = 'https://view.eumetsat.int/geoserver/ows';
const CAPABILITIES_URL =
  'https://view.eumetsat.int/geoserver/mtg_fd/li_afa/ows?service=WMS&version=1.3.0&request=GetCapabilities';
const LAYER = 'mtg_fd:li_afa';

export interface LightningFrame {
  /** Instant de l'image, epoch ms UTC. */
  readonly time: number;
  readonly imageUrl: string;
}

export interface LightningFrames {
  readonly area: LightningArea;
  readonly frames: readonly LightningFrame[];
}

/** Instant (epoch ms) de la derniere image publiee, ou null si les capacites ne le disent pas. */
export function parseLatestFrameTime(capabilities: string): number | null {
  const match = /<Dimension\b[^>]*\bname="time"[^>]*\bdefault="([^"]+)"/.exec(capabilities);
  const time = match?.[1] === undefined ? Number.NaN : Date.parse(match[1]);
  return Number.isFinite(time) ? time : null;
}

/** Adresse de l'image d'un instant : la zone en Web Mercator, fond transparent. */
export function buildLightningImageUrl(input: {
  readonly time: number;
  readonly area: LightningArea;
}): string {
  const { minX, minY, maxX, maxY } = input.area.mercator;
  const url = new URL(WMS_URL);
  url.searchParams.set('service', 'WMS');
  url.searchParams.set('version', '1.3.0');
  url.searchParams.set('request', 'GetMap');
  url.searchParams.set('layers', LAYER);
  url.searchParams.set('styles', '');
  url.searchParams.set('format', 'image/png');
  url.searchParams.set('transparent', 'true');
  url.searchParams.set('crs', 'EPSG:3857');
  url.searchParams.set('bbox', [minX, minY, maxX, maxY].map((value) => value.toFixed(1)).join(','));
  url.searchParams.set('width', String(input.area.width));
  url.searchParams.set('height', String(input.area.height));
  url.searchParams.set('time', new Date(input.time).toISOString().replace('.000Z', 'Z'));
  return url.toString();
}

/** Les images des deux dernieres heures autour du lieu, de la plus ancienne a la plus recente. */
export async function fetchLightningFrames(
  center: { readonly latitude: number; readonly longitude: number },
  signal?: AbortSignal,
): Promise<HttpResult<LightningFrames>> {
  const result = await requestText(CAPABILITIES_URL, { signal, retries: 1 });
  if (!result.ok) {
    return result;
  }
  const latest = parseLatestFrameTime(result.value);
  if (latest === null) {
    return {
      ok: false,
      failure: { kind: 'malformed', detail: 'foudre : instant de la derniere image absent' },
    };
  }
  const area = lightningArea(center, LIGHTNING.halfExtentKm);
  return {
    ok: true,
    value: {
      area,
      frames: lightningFrameTimes(latest).map((time) => ({
        time,
        imageUrl: buildLightningImageUrl({ time, area }),
      })),
    },
  };
}

import { tileUrl } from '../domain/tiles';
import type { Tile } from '../domain/tiles';

/*
 * Telechargement a l'avance des tuiles de carte. Les requetes passent par le
 * service worker, qui garde les tuiles OpenStreetMap (sw.ts, regle 7) : elles
 * servent ensuite hors ligne. Peu de requetes a la fois, jamais en tache de
 * fond : l'utilisateur le lance, voit la progression, peut l'arreter.
 */

/** Requetes simultanees : OpenStreetMap demande un usage mesure. */
export const TILE_CONCURRENCY = 2;

export interface TileDownload {
  readonly done: number;
  readonly failed: number;
  readonly total: number;
}

/**
 * Telecharge les tuiles, `TILE_CONCURRENCY` a la fois, et rend le bilan. Une
 * tuile qui echoue est comptee, jamais retentee en boucle ; `signal` arrete
 * le telechargement entre deux tuiles.
 */
export async function downloadTiles(input: {
  readonly tiles: readonly Tile[];
  readonly template: string;
  readonly onProgress?: (progress: TileDownload) => void;
  readonly signal?: AbortSignal;
  readonly fetcher?: (url: string) => Promise<Response>;
}): Promise<TileDownload> {
  const fetcher =
    input.fetcher ?? ((url: string) => fetch(url, { mode: 'cors', credentials: 'omit' }));
  const total = input.tiles.length;
  let done = 0;
  let failed = 0;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (input.signal?.aborted !== true) {
      const tile = input.tiles[next];
      next += 1;
      if (tile === undefined) {
        return;
      }
      try {
        const response = await fetcher(tileUrl(input.template, tile));
        // Le corps est lu pour que le service worker acheve sa mise en cache.
        await response.arrayBuffer();
        if (response.ok) {
          done += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
      input.onProgress?.({ done, failed, total });
    }
  };
  await Promise.all(Array.from({ length: TILE_CONCURRENCY }, () => worker()));
  return { done, failed, total };
}

/** Le service worker controle-t-il la page ? Sans lui, rien n'est garde. */
export function tilesCanBeKept(): boolean {
  return typeof navigator !== 'undefined' && navigator.serviceWorker?.controller != null;
}

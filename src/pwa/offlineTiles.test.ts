import { afterEach, describe, expect, it, vi } from 'vitest';
import { TILE_CONCURRENCY, downloadTiles, tilesCanBeKept } from './offlineTiles';

const TILES = Array.from({ length: 6 }, (_, i) => ({ z: 9, x: 260 + i, y: 180 }));
const TEMPLATE = 'https://t.example/{z}/{x}/{y}.png';

function ok(): Response {
  return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('downloadTiles', () => {
  it('telecharge chaque tuile avec peu de requetes a la fois, et rend le bilan', async () => {
    const urls: string[] = [];
    let inFlight = 0;
    let peak = 0;
    const progress: number[] = [];
    const result = await downloadTiles({
      tiles: TILES,
      template: TEMPLATE,
      onProgress: (p) => progress.push(p.done),
      fetcher: async (url) => {
        urls.push(url);
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return ok();
      },
    });
    expect(result).toEqual({ done: 6, failed: 0, total: 6 });
    expect(urls).toContain('https://t.example/9/260/180.png');
    expect(peak).toBeLessThanOrEqual(TILE_CONCURRENCY);
    expect(progress.at(-1)).toBe(6);
  });

  it('compte une tuile refusee ou en echec, sans la retenter ni s arreter', async () => {
    let calls = 0;
    const result = await downloadTiles({
      tiles: TILES,
      template: TEMPLATE,
      fetcher: async () => {
        calls += 1;
        if (calls === 2) {
          return new Response(null, { status: 429 });
        }
        if (calls === 3) {
          throw new TypeError('reseau');
        }
        return ok();
      },
    });
    expect(result).toEqual({ done: 4, failed: 2, total: 6 });
    expect(calls).toBe(6);
  });

  it('s arrete entre deux tuiles quand on l abandonne', async () => {
    const controller = new AbortController();
    let calls = 0;
    const result = await downloadTiles({
      tiles: TILES,
      template: TEMPLATE,
      signal: controller.signal,
      fetcher: async () => {
        calls += 1;
        controller.abort();
        return ok();
      },
    });
    expect(calls).toBeLessThanOrEqual(TILE_CONCURRENCY);
    expect(result.done + result.failed).toBe(calls);
  });

  it('utilise fetch par defaut, sans identifiants', async () => {
    const spy = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', spy);
    await downloadTiles({ tiles: TILES.slice(0, 1), template: TEMPLATE });
    expect(spy).toHaveBeenCalledWith('https://t.example/9/260/180.png', {
      mode: 'cors',
      credentials: 'omit',
    });
    vi.unstubAllGlobals();
  });
});

describe('tilesCanBeKept', () => {
  it('suppose un service worker qui controle la page', () => {
    expect(tilesCanBeKept()).toBe(false);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: null },
    });
    expect(tilesCanBeKept()).toBe(false);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: {} },
    });
    expect(tilesCanBeKept()).toBe(true);
  });
});

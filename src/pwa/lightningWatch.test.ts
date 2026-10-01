import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../tests/msw';
import { loadLightningNear, readActiveMask } from './lightningWatch';

const CAPABILITIES = 'https://view.eumetsat.int/geoserver/mtg_fd/li_afa/ows';
const VIRIEU = { latitude: 45.49, longitude: 5.47 };

function capabilities() {
  return http.get(CAPABILITIES, () =>
    HttpResponse.text('<Dimension name="time" default="2026-09-28T13:25:00Z">x</Dimension>'),
  );
}

describe('loadLightningNear', () => {
  it('lit les trois dernieres images de la zone de 64 pixels', async () => {
    server.use(capabilities());
    const urls: string[] = [];
    const near = await loadLightningNear(VIRIEU, async (url) => {
      urls.push(url);
      return null;
    });
    // Aucune image lisible : rien a dire, sans erreur.
    expect(near).toBeNull();
    expect(urls).toHaveLength(3);
    const params = new URL(urls[2] ?? '').searchParams;
    expect(params.get('width')).toBe('64');
    expect(params.get('time')).toBe('2026-09-28T13:25:00Z');
    expect(new URL(urls[0] ?? '').searchParams.get('time')).toBe('2026-09-28T13:15:00Z');
  });

  it('ignore une image illisible et garde les autres', async () => {
    server.use(capabilities());
    let call = 0;
    const near = await loadLightningNear(VIRIEU, async () => {
      call += 1;
      return call === 2
        ? {
            width: 64,
            height: 64,
            active: Array.from({ length: 64 * 64 }, (_, i) => i === 32 * 64 + 32),
          }
        : null;
    });
    expect(near?.cells).toBe(1);
    expect(near?.nearestKm).toBeLessThan(2);
  });

  it('rend null quand les capacites du service sont injoignables', async () => {
    server.use(http.get(CAPABILITIES, () => HttpResponse.error()));
    expect(await loadLightningNear(VIRIEU, async () => null)).toBeNull();
  });
});

describe('readActiveMask', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const IMAGE = 'https://view.eumetsat.int/geoserver/ows?x=1';

  it('marque les pixels non transparents, ligne par ligne', async () => {
    server.use(http.get('https://view.eumetsat.int/geoserver/ows', () => HttpResponse.text('png')));
    vi.stubGlobal('createImageBitmap', async () => ({ width: 2, height: 2 }));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return {
            drawImage: () => undefined,
            // Quatre pixels RGBA : le deuxieme et le dernier sont colores.
            getImageData: () => ({
              data: new Uint8ClampedArray([
                0, 0, 0, 0, 255, 200, 0, 255, 0, 0, 0, 0, 255, 0, 0, 90,
              ]),
            }),
          };
        }
      },
    );
    expect(await readActiveMask(IMAGE)).toEqual({
      width: 2,
      height: 2,
      active: [false, true, false, true],
    });
  });

  it('rend null sur une reponse en erreur, un contexte absent ou un decodage qui echoue', async () => {
    server.use(
      http.get(
        'https://view.eumetsat.int/geoserver/ows',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    expect(await readActiveMask(IMAGE)).toBeNull();

    server.use(http.get('https://view.eumetsat.int/geoserver/ows', () => HttpResponse.text('png')));
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1 }));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return null;
        }
      },
    );
    expect(await readActiveMask(IMAGE)).toBeNull();

    vi.stubGlobal('createImageBitmap', async () => {
      throw new Error('decodage');
    });
    expect(await readActiveMask(IMAGE)).toBeNull();
  });
});

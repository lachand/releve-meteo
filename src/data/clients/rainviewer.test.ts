import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import { fetchLatestRadarFrame, fetchRadarFrames } from './rainviewer';

const WEATHER_MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';

describe('fetchLatestRadarFrame', () => {
  it('retient la derniere trame passee et construit le gabarit de tuile', async () => {
    server.use(
      http.get(WEATHER_MAPS_URL, () =>
        HttpResponse.json({
          host: 'https://tilecache.rainviewer.com',
          radar: {
            past: [
              { time: 1700000000, path: '/v2/radar/aaa' },
              { time: 1700000600, path: '/v2/radar/bbb' },
            ],
          },
        }),
      ),
    );

    const result = await fetchLatestRadarFrame();
    expect(result).toEqual({
      ok: true,
      value: {
        time: 1700000600,
        tileUrlTemplate: 'https://tilecache.rainviewer.com/v2/radar/bbb/256/{z}/{x}/{y}/2/1_1.png',
      },
    });
  });

  it("retourne null sans exception quand aucune trame n'est publiee", async () => {
    server.use(
      http.get(WEATHER_MAPS_URL, () =>
        HttpResponse.json({ host: 'https://tilecache.rainviewer.com', radar: { past: [] } }),
      ),
    );

    const result = await fetchLatestRadarFrame();
    expect(result).toEqual({ ok: true, value: null });
  });

  it("propage un HttpResult d'echec", async () => {
    server.use(http.get(WEATHER_MAPS_URL, () => new HttpResponse(null, { status: 500 })));

    const result = await fetchLatestRadarFrame();
    expect(result.ok).toBe(false);
  });
});

describe('fetchRadarFrames', () => {
  it('ordonne les trames observees puis prevues, avec leur provenance', async () => {
    server.use(
      http.get('https://api.rainviewer.com/public/weather-maps.json', () =>
        HttpResponse.json({
          host: 'https://tilecache.rainviewer.com',
          radar: {
            past: [
              { time: 1700000600, path: '/v2/radar/b' },
              { time: 1700000000, path: '/v2/radar/a' },
            ],
            nowcast: [{ time: 1700001200, path: '/v2/radar/c' }],
          },
        }),
      ),
    );
    const result = await fetchRadarFrames();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.map((f) => `${f.time}:${f.provenance}`)).toEqual([
      '1700000000:observed',
      '1700000600:observed',
      '1700001200:forecast',
    ]);
    expect(result.value[0]?.tileUrlTemplate).toBe(
      'https://tilecache.rainviewer.com/v2/radar/a/256/{z}/{x}/{y}/2/1_1.png',
    );
  });

  it('retourne une liste vide sans trame, et propage un echec', async () => {
    server.use(
      http.get('https://api.rainviewer.com/public/weather-maps.json', () =>
        HttpResponse.json({ host: 'https://tilecache.rainviewer.com' }),
      ),
    );
    const empty = await fetchRadarFrames();
    expect(empty).toEqual({ ok: true, value: [] });

    server.use(
      http.get('https://api.rainviewer.com/public/weather-maps.json', () => HttpResponse.error()),
    );
    const failed = await fetchRadarFrames();
    expect(failed.ok).toBe(false);
  });
});

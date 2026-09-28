import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import { fetchRadarFrames } from './rainviewer';

const WEATHER_MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';

describe('fetchRadarFrames', () => {
  it('ordonne les trames observees puis prevues, avec leur provenance', async () => {
    server.use(
      http.get(WEATHER_MAPS_URL, () =>
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
      'https://tilecache.rainviewer.com/v2/radar/a/512/{z}/{x}/{y}/2/1_1.png',
    );
  });

  it('retourne une liste vide sans trame, et propage un echec', async () => {
    server.use(
      http.get(WEATHER_MAPS_URL, () =>
        HttpResponse.json({ host: 'https://tilecache.rainviewer.com' }),
      ),
    );
    const empty = await fetchRadarFrames();
    expect(empty).toEqual({ ok: true, value: [] });

    server.use(http.get(WEATHER_MAPS_URL, () => HttpResponse.error()));
    const failed = await fetchRadarFrames();
    expect(failed.ok).toBe(false);
  });
});

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import { lightningArea } from '../../domain/lightning';
import { buildLightningImageUrl, fetchLightningFrames, parseLatestFrameTime } from './lightning';

const CAPABILITIES_URL = 'https://view.eumetsat.int/geoserver/mtg_fd/li_afa/ows';
const LYON = { latitude: 45.75, longitude: 4.85 };

const CAPABILITIES = `<?xml version="1.0"?><WMS_Capabilities><Capability><Layer>
  <Name>mtg_fd:li_afa</Name>
  <Dimension name="time" default="2026-10-01T11:30:00Z" units="ISO8601" nearestValue="1">2025-05-30T15:00:00.000Z/2026-10-01T11:30:00.000Z/PT5M</Dimension>
</Layer></Capability></WMS_Capabilities>`;

describe('parseLatestFrameTime', () => {
  it("lit l'instant par defaut de la dimension de temps", () => {
    expect(parseLatestFrameTime(CAPABILITIES)).toBe(Date.UTC(2026, 9, 1, 11, 30));
  });

  it("rend null quand la dimension ou l'instant manque ou est illisible", () => {
    expect(parseLatestFrameTime('<WMS_Capabilities/>')).toBeNull();
    expect(parseLatestFrameTime('<Dimension name="time" default="hier">x</Dimension>')).toBeNull();
    expect(
      parseLatestFrameTime('<Dimension name="elevation" default="0">x</Dimension>'),
    ).toBeNull();
  });
});

describe('buildLightningImageUrl', () => {
  it('demande la couche des eclairs accumules en Web Mercator, sur fond transparent', () => {
    const area = lightningArea(LYON);
    const url = new URL(buildLightningImageUrl({ time: Date.UTC(2026, 9, 1, 11, 30), area }));
    expect(url.origin + url.pathname).toBe('https://view.eumetsat.int/geoserver/ows');
    expect(url.searchParams.get('layers')).toBe('mtg_fd:li_afa');
    expect(url.searchParams.get('crs')).toBe('EPSG:3857');
    expect(url.searchParams.get('transparent')).toBe('true');
    expect(url.searchParams.get('time')).toBe('2026-10-01T11:30:00Z');
    expect(url.searchParams.get('width')).toBe(String(area.width));
    expect(url.searchParams.get('height')).toBe(String(area.height));
    const [minX, minY, maxX, maxY] = (url.searchParams.get('bbox') ?? '').split(',').map(Number);
    expect(minX).toBeCloseTo(area.mercator.minX, 0);
    expect(maxY).toBeCloseTo(area.mercator.maxY, 0);
    expect(minY).toBeLessThan(maxY ?? 0);
    expect(minX).toBeLessThan(maxX ?? 0);
  });
});

describe('fetchLightningFrames', () => {
  it('rend les images des deux dernieres heures, la derniere etant la derniere publiee', async () => {
    server.use(http.get(CAPABILITIES_URL, () => HttpResponse.text(CAPABILITIES)));
    const result = await fetchLightningFrames(LYON);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.frames).toHaveLength(24);
    expect(result.value.frames.at(-1)?.time).toBe(Date.UTC(2026, 9, 1, 11, 30));
    expect(result.value.frames[0]?.time).toBe(Date.UTC(2026, 9, 1, 9, 35));
    expect(result.value.frames.at(-1)?.imageUrl).toContain('time=2026-10-01T11%3A30%3A00Z');
  });

  it('dit une reponse sans instant, et propage un echec reseau', async () => {
    server.use(http.get(CAPABILITIES_URL, () => HttpResponse.text('<WMS_Capabilities/>')));
    const malformed = await fetchLightningFrames(LYON);
    expect(malformed).toMatchObject({ ok: false, failure: { kind: 'malformed' } });

    server.use(http.get(CAPABILITIES_URL, () => HttpResponse.error()));
    const network = await fetchLightningFrames(LYON);
    expect(network).toMatchObject({ ok: false, failure: { kind: 'network' } });
  });
});

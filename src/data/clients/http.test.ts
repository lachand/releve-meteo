import { http, HttpResponse, delay as mswDelay } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw';
import { request, requestText } from './http';

const URL = 'https://example.test/data';

/**
 * Compresse un texte en gzip via l'API Web standard (pas de zlib Node, hors
 * de la surface typee de ce projet, cf. tsconfig.app.json `types`).
 */
async function gzip(text: string): Promise<Uint8Array> {
  const body = new Response(text).body;
  if (body === null) {
    return new Uint8Array();
  }
  const compressed = body.pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

afterEach(() => {
  vi.useRealTimers();
});

describe('request', () => {
  it('retourne ok:true sur HTTP 200', async () => {
    server.use(http.get(URL, () => HttpResponse.json({ hello: 'world' })));
    const result = await request<{ hello: string }>(URL);
    expect(result).toEqual({ ok: true, value: { hello: 'world' } });
  });

  it('lit retryAfterMs depuis Retry-After sur HTTP 429', async () => {
    server.use(
      http.get(URL, () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '7' } })),
    );
    const result = await request(URL, { retries: 0 });
    expect(result).toEqual({ ok: false, failure: { kind: 'rate_limited', retryAfterMs: 7000 } });
  });

  it('applique un defaut sur HTTP 429 sans Retry-After', async () => {
    server.use(http.get(URL, () => new HttpResponse(null, { status: 429 })));
    const result = await request(URL, { retries: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('rate_limited');
    }
  });

  it('applique un defaut sur un Retry-After illisible', async () => {
    server.use(
      http.get(
        URL,
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': 'bientot' } }),
      ),
    );
    const result = await request(URL, { retries: 0 });
    expect(result).toEqual({ ok: false, failure: { kind: 'rate_limited', retryAfterMs: 5000 } });
  });

  it('retourne malformed sans nouvelle tentative sur un 4xx hors 429', async () => {
    let calls = 0;
    server.use(
      http.get(URL, () => {
        calls += 1;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    const result = await request(URL);
    expect(result).toEqual({ ok: false, failure: { kind: 'malformed', detail: 'HTTP 404' } });
    expect(calls).toBe(1);
  });

  it('retourne server_error apres epuisement des tentatives sur HTTP 500', async () => {
    let calls = 0;
    server.use(
      http.get(URL, () => {
        calls += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );
    const result = await request(URL, { retries: 2 });
    expect(result).toEqual({ ok: false, failure: { kind: 'server_error', status: 500 } });
    expect(calls).toBe(3);
  });

  it('reussit apres HTTP 500 puis 200, une seule tentative supplementaire consommee', async () => {
    let calls = 0;
    server.use(
      http.get(URL, () => {
        calls += 1;
        if (calls === 1) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );
    const result = await request(URL);
    expect(result).toEqual({ ok: true, value: { ok: true } });
    expect(calls).toBe(2);
  });

  it('retourne network sur un echec reseau', async () => {
    server.use(http.get(URL, () => HttpResponse.error()));
    const result = await request(URL, { retries: 0 });
    expect(result).toEqual({ ok: false, failure: { kind: 'network' } });
  });

  it('retourne timeout au-dela du delai imparti', async () => {
    server.use(
      http.get(URL, async () => {
        await mswDelay(100);
        return HttpResponse.json({ ok: true });
      }),
    );
    const result = await request(URL, { timeoutMs: 20, retries: 0 });
    expect(result).toEqual({ ok: false, failure: { kind: 'timeout' } });
  });

  it('retourne aborted sans nouvelle tentative quand le signal appelant se declenche', async () => {
    let calls = 0;
    const controller = new AbortController();
    server.use(
      http.get(URL, async () => {
        calls += 1;
        await mswDelay(50);
        return HttpResponse.json({ ok: true });
      }),
    );
    const promise = request(URL, { signal: controller.signal, retries: 2 });
    controller.abort();
    const result = await promise;
    expect(result).toEqual({ ok: false, failure: { kind: 'aborted' } });
    expect(calls).toBe(1);
  });

  it('retourne malformed sur un JSON invalide', async () => {
    server.use(http.get(URL, () => new HttpResponse('{not json', { status: 200 })));
    const result = await request(URL, { retries: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('malformed');
    }
  });

  it('backoff : delais croissants avec gigue, horloge simulee', async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get(URL, () => {
        calls += 1;
        if (calls < 3) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const promise = request(URL);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(calls).toBe(3);
    const backoffDelays = setTimeoutSpy.mock.calls
      .map(([, ms]) => Number(ms))
      .filter((ms) => ms < 5000);
    expect(backoffDelays).toHaveLength(2);
    expect(backoffDelays[1]).toBeGreaterThan(backoffDelays[0] as number);
  });
});

describe('requestText', () => {
  it('retourne le corps texte tel quel sans gzip', async () => {
    server.use(http.get(URL, () => new HttpResponse('year,month\n2026,9', { status: 200 })));
    const result = await requestText(URL);
    expect(result).toEqual({ ok: true, value: 'year,month\n2026,9' });
  });

  it('decompresse un corps gzip quand gzip:true', async () => {
    const original = 'year,month,day,hour,temp,temp_source\n2026,9,28,10,14.2,metar';
    const compressed = await gzip(original);
    server.use(
      http.get(
        URL,
        () => new HttpResponse(compressed, { headers: { 'Content-Type': 'application/gzip' } }),
      ),
    );
    const result = await requestText(URL, { gzip: true });
    expect(result).toEqual({ ok: true, value: original });
  });

  it('retourne une chaine vide quand le corps gzip est absent', async () => {
    server.use(http.get(URL, () => new HttpResponse(null, { status: 200 })));
    const result = await requestText(URL, { gzip: true });
    expect(result).toEqual({ ok: true, value: '' });
  });

  it('propage un echec reseau comme pour request()', async () => {
    server.use(http.get(URL, () => HttpResponse.error()));
    const result = await requestText(URL, { retries: 0 });
    expect(result).toEqual({ ok: false, failure: { kind: 'network' } });
  });

  it('retourne server_error apres epuisement des tentatives, meme logique de retry que request()', async () => {
    let calls = 0;
    server.use(
      http.get(URL, () => {
        calls += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );
    const result = await requestText(URL, { retries: 1 });
    expect(result).toEqual({ ok: false, failure: { kind: 'server_error', status: 500 } });
    expect(calls).toBe(2);
  });
});

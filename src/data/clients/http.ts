export type HttpFailure =
  | { readonly kind: 'rate_limited'; readonly retryAfterMs: number }
  | { readonly kind: 'server_error'; readonly status: number }
  | { readonly kind: 'network' }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'aborted' }
  | { readonly kind: 'malformed'; readonly detail: string };

export type HttpResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: HttpFailure };

export interface RequestOptions {
  readonly timeoutMs?: number; // defaut 10000
  readonly retries?: number; // defaut 2, backoff exponentiel avec jitter
  readonly signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const BACKOFF_BASE_MS = 300;
const DEFAULT_RETRY_AFTER_MS = 5_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Backoff exponentiel (300ms, 600ms, 1200ms, ...) avec 30% de gigue pour
// eviter que des clients synchronises ne cognent le serveur au meme instant.
function backoffDelayMs(attempt: number): number {
  const base = BACKOFF_BASE_MS * 2 ** attempt;
  return base + Math.random() * base * 0.3;
}

function parseRetryAfterMs(header: string | null): number {
  if (header === null) {
    return DEFAULT_RETRY_AFTER_MS;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  return DEFAULT_RETRY_AFTER_MS;
}

function isRetryable(failure: HttpFailure): boolean {
  return (
    failure.kind === 'network' || failure.kind === 'timeout' || failure.kind === 'server_error'
  );
}

async function attemptRequest<T>(
  url: string,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
): Promise<HttpResult<T>> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal =
    callerSignal === undefined
      ? timeoutController.signal
      : AbortSignal.any([timeoutController.signal, callerSignal]);

  try {
    let response: Response;
    try {
      response = await fetch(url, { signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          ok: false,
          failure: { kind: callerSignal?.aborted === true ? 'aborted' : 'timeout' },
        };
      }
      return { ok: false, failure: { kind: 'network' } };
    }

    if (response.status === 429) {
      return {
        ok: false,
        failure: {
          kind: 'rate_limited',
          retryAfterMs: parseRetryAfterMs(response.headers.get('Retry-After')),
        },
      };
    }
    if (response.status >= 500) {
      return { ok: false, failure: { kind: 'server_error', status: response.status } };
    }
    if (!response.ok) {
      return { ok: false, failure: { kind: 'malformed', detail: `HTTP ${response.status}` } };
    }

    try {
      const value = (await response.json()) as T;
      return { ok: true, value };
    } catch {
      return { ok: false, failure: { kind: 'malformed', detail: 'JSON invalide' } };
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Aucune exception n'est levee pour un echec reseau. Les erreurs sont des valeurs. */
export async function request<T>(
  url: string,
  options: RequestOptions = {},
): Promise<HttpResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  let attempt = 0;
  for (;;) {
    const result = await attemptRequest<T>(url, timeoutMs, options.signal);
    if (result.ok || attempt >= retries || !isRetryable(result.failure)) {
      return result;
    }
    await delay(backoffDelayMs(attempt));
    attempt += 1;
  }
}

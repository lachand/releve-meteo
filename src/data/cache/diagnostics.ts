import type { HttpFailure, HttpResult } from '../clients/http';

/*
 * Journal de diagnostic local : pour chaque source de donnees, la derniere
 * lecture reussie et le dernier echec (nature et heure). Reste sur cet
 * appareil, ne contient que des heures et des natures d'echec, jamais une
 * requete ni une adresse. Il sert a dire ce qui ne repond pas, sans console.
 */

export const DIAGNOSTIC_SOURCES = [
  'forecast',
  'ensemble',
  'verification',
  'station',
  'vigilance',
  'airQuality',
  'nowcast',
  'grid',
  'normals',
  'marine',
] as const;

export type DiagnosticSource = (typeof DIAGNOSTIC_SOURCES)[number];

export interface SourceDiagnostic {
  /** Derniere lecture reussie, epoch ms. */
  readonly lastSuccess: number | null;
  readonly lastFailure: {
    readonly at: number;
    readonly kind: HttpFailure['kind'];
    /** Code HTTP quand la source en a repondu un. */
    readonly status: number | null;
  } | null;
}

export type Diagnostics = Readonly<Record<DiagnosticSource, SourceDiagnostic>>;

const STORAGE_KEY = 'meteo-fr:diagnostics';
const FAILURE_KINDS: ReadonlySet<unknown> = new Set([
  'rate_limited',
  'server_error',
  'network',
  'timeout',
  'aborted',
  'malformed',
]);

const EMPTY: SourceDiagnostic = { lastSuccess: null, lastFailure: null };

function emptyDiagnostics(): Diagnostics {
  return Object.fromEntries(DIAGNOSTIC_SOURCES.map((source) => [source, EMPTY])) as Diagnostics;
}

let memory: Diagnostics | null = null;

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readEntry(raw: unknown): SourceDiagnostic {
  const entry = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const failure = entry.lastFailure as Record<string, unknown> | null | undefined;
  return {
    lastSuccess: isTime(entry.lastSuccess) ? entry.lastSuccess : null,
    lastFailure:
      failure !== null &&
      typeof failure === 'object' &&
      isTime(failure.at) &&
      FAILURE_KINDS.has(failure.kind)
        ? {
            at: failure.at,
            kind: failure.kind as HttpFailure['kind'],
            status: isTime(failure.status) ? failure.status : null,
          }
        : null,
  };
}

/** Journal courant ; une source jamais lue, ou un stockage illisible, vaut « rien a dire ». */
export function readDiagnostics(): Diagnostics {
  if (memory !== null) {
    return memory;
  }
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    return Object.fromEntries(
      DIAGNOSTIC_SOURCES.map((source) => [source, readEntry(stored[source])]),
    ) as Diagnostics;
  } catch {
    return emptyDiagnostics();
  }
}

function write(next: Diagnostics): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    memory = null;
  } catch {
    // Quota ou mode prive : le journal de la session suffit.
    memory = next;
  }
}

/** Note l'issue d'une lecture reseau de cette source. */
export function recordDiagnostic(
  source: DiagnosticSource,
  result: HttpResult<unknown>,
  now: number,
): void {
  const current = readDiagnostics();
  const entry = current[source];
  const next: SourceDiagnostic = result.ok
    ? { ...entry, lastSuccess: now }
    : {
        ...entry,
        lastFailure: {
          at: now,
          kind: result.failure.kind,
          status: 'status' in result.failure ? result.failure.status : null,
        },
      };
  write({ ...current, [source]: next });
}

export function clearDiagnostics(): void {
  memory = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Rien a effacer.
  }
}

export function resetDiagnosticsForTests(): void {
  memory = null;
}

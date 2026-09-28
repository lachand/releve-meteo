import { emptyWatchState, pruneNotified } from '../../domain/watch';
import type { WatchEntry, WatchState } from '../../domain/watch';
import { getDataset, setDataset } from './datasetStore';

/*
 * Etat de la veille en arriere-plan, partage entre la page (qui recopie
 * les lieux veilles) et le service worker (qui note ce qu'il a notifie).
 * Chacun relit l'etat juste avant d'ecrire et ne remplace que sa part :
 * une veille qui dure quelques secondes n'efface pas une recopie faite
 * entre-temps.
 */

const WATCH_ID = 'all';
/** Jamais perime : l'etat n'est pas un cache. */
const NEVER = Number.MAX_SAFE_INTEGER;

function isWatchState(value: unknown): value is WatchState {
  const state = value as Partial<WatchState> | null;
  return (
    typeof state === 'object' &&
    state !== null &&
    Array.isArray(state.entries) &&
    typeof state.notified === 'object' &&
    state.notified !== null
  );
}

export async function readWatchState(): Promise<WatchState> {
  const cached = await getDataset<unknown>('watch', WATCH_ID);
  return cached !== null && isWatchState(cached.value) ? cached.value : emptyWatchState();
}

async function write(state: WatchState, now: Date): Promise<void> {
  await setDataset('watch', WATCH_ID, state, now.getTime(), NEVER);
}

/** Page : lieux veilles et unite de vent a jour. */
export async function saveWatchEntries(
  entries: readonly WatchEntry[],
  windUnit: WatchState['windUnit'],
  now: Date,
): Promise<void> {
  const current = await readWatchState();
  await write({ ...current, entries, windUnit }, now);
}

/**
 * Cles deja portees a la connaissance de l'utilisateur : notifiees par le
 * service worker, ou vues dans la page (bandeaux), pour ne pas notifier
 * plus tard ce qu'il a deja lu.
 */
export async function markNotified(
  keys: readonly string[],
  now: Date,
  lastRunUtcMs?: number,
): Promise<void> {
  const current = await readWatchState();
  const known = keys.every((key) => key in current.notified);
  if (known && lastRunUtcMs === undefined) {
    return;
  }
  const notified = pruneNotified(current.notified, now);
  for (const key of keys) {
    notified[key] ??= now.getTime();
  }
  await write({ ...current, notified, lastRunUtcMs: lastRunUtcMs ?? current.lastRunUtcMs }, now);
}

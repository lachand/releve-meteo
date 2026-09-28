import { WATCH_RUN_MESSAGE, WATCH_TAG } from './watchTags';

/*
 * Veille en arriere-plan cote page : detection du support reel,
 * activation, arret. Periodic Background Sync n'existe que dans Chrome et
 * Edge, et n'est accorde qu'a une application installee ; ailleurs,
 * l'interface le dit au lieu de promettre une notification qui ne
 * viendra pas (SERVICE_WORKER.md 9).
 */

export type WatchStatus = 'unsupported' | 'blocked' | 'needs-install' | 'off' | 'on';

interface PeriodicSyncManager {
  register(tag: string, options?: { readonly minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

type SyncRegistration = ServiceWorkerRegistration & {
  readonly periodicSync?: PeriodicSyncManager;
};

/** Attente maximale de l'enregistrement du service worker, ms. */
const READY_WAIT_MS = 5000;

/** Rythme demande ; le navigateur l'allonge a sa guise, souvent a 12 h ou plus. */
export const WATCH_MIN_INTERVAL_MS = 3 * 60 * 60 * 1000;

async function syncManager(): Promise<{
  readonly registration: SyncRegistration;
  readonly sync: PeriodicSyncManager;
} | null> {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    typeof Notification === 'undefined'
  ) {
    return null;
  }
  // Premiere visite : l'enregistrement du service worker suit le chargement
  // de la page. On l'attend un temps, sans bloquer si le service worker est
  // desactive (developpement), ou `ready` ne se resout jamais.
  const registration = ((await navigator.serviceWorker.getRegistration()) ??
    (await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), READY_WAIT_MS)),
    ]))) as SyncRegistration | undefined;
  const sync = registration?.periodicSync;
  return registration === undefined || sync === undefined ? null : { registration, sync };
}

/** Le navigateur accorde-t-il la synchronisation periodique (application installee) ? */
async function syncGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({
      // Absent des types DOM : permission propre a Chromium.
      name: 'periodic-background-sync' as Parameters<typeof navigator.permissions.query>[0]['name'],
    });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

export async function readWatchStatus(): Promise<WatchStatus> {
  const manager = await syncManager();
  if (manager === null) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') {
    return 'blocked';
  }
  const tags = await manager.sync.getTags();
  if (tags.includes(WATCH_TAG) && Notification.permission === 'granted') {
    return 'on';
  }
  return (await syncGranted()) ? 'off' : 'needs-install';
}

/** Demande la permission de notifier et inscrit la veille. */
export async function enableWatch(): Promise<WatchStatus> {
  const manager = await syncManager();
  if (manager === null) {
    return 'unsupported';
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return permission === 'denied' ? 'blocked' : 'off';
  }
  try {
    await manager.sync.register(WATCH_TAG, { minInterval: WATCH_MIN_INTERVAL_MS });
  } catch {
    // Refus du navigateur : application non installee.
    return 'needs-install';
  }
  return 'on';
}

/** Lance une veille tout de suite, une fois les lieux recopies. */
export async function requestWatchRun(): Promise<void> {
  const manager = await syncManager();
  manager?.registration.active?.postMessage({ type: WATCH_RUN_MESSAGE });
}

export async function disableWatch(): Promise<WatchStatus> {
  const manager = await syncManager();
  if (manager === null) {
    return 'unsupported';
  }
  await manager.sync.unregister(WATCH_TAG);
  return readWatchStatus();
}

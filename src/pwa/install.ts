/**
 * Enregistrement du service worker et cycle de mise a jour cote page,
 * SERVICE_WORKER.md section 6. Le SW ne se remplace jamais lui-meme sans
 * que l'utilisateur le sache : on notifie l'appelant, qui affiche un
 * bandeau, et on ne recharge qu'une seule fois sur `controllerchange`.
 */

type BeforeInstallPromptEvent = Event & {
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
};

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

function isServiceWorkerEnabled(): boolean {
  return !import.meta.env.DEV || import.meta.env.VITE_SW === '1';
}

let waitingWorker: ServiceWorker | null = null;
let reloadedOnce = false;

/**
 * Enregistre `/sw.js` et appelle `onUpdateAvailable` chaque fois qu'une
 * nouvelle version est installee et prete a prendre le controle. Desactive
 * en developpement sauf `VITE_SW=1` (section 11) : un SW actif en dev
 * masque les modifications.
 */
export function registerServiceWorker(onUpdateAvailable: () => void): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  if (!isServiceWorkerEnabled()) {
    return;
  }

  // Le SW appelle `clients.claim()` a l'activation (section 4), y compris
  // pour la toute premiere installation : une page chargee sans controleur
  // en acquiert alors un sans qu'il y ait de mise a jour reelle a recharger.
  // Seul un `controllerchange` survenant apres un premier controleur deja
  // en place correspond a une vraie mise a jour (bascule vers un nouveau
  // worker suite au clic « Actualiser »).
  let hasController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hasController) {
      hasController = true;
      return;
    }
    if (reloadedOnce) {
      return;
    }
    reloadedOnce = true;
    window.location.reload();
  });

  // `window`'s `load` a pu deja se produire avant que cet effet React ne
  // s'execute (montage differe apres le premier rendu) : un ecouteur pose
  // apres coup ne se declenche jamais. `readyState === 'complete'` est
  // l'equivalent synchrone d'un `load` deja survenu.
  const onWindowLoaded = () => {
    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      const notifyIfWaiting = () => {
        if (registration.waiting !== null && navigator.serviceWorker.controller !== null) {
          waitingWorker = registration.waiting;
          onUpdateAvailable();
        }
      };
      notifyIfWaiting();

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (installing === null) {
          return;
        }
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller !== null) {
            waitingWorker = installing;
            onUpdateAvailable();
          }
        });
      });

      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') {
          return;
        }
        const now = Date.now();
        if (now - lastCheck < UPDATE_CHECK_INTERVAL_MS) {
          return;
        }
        lastCheck = now;
        void registration.update();
      });
    });
  };

  if (document.readyState === 'complete') {
    onWindowLoaded();
  } else {
    window.addEventListener('load', onWindowLoaded, { once: true });
  }
}

/** Demande au worker en attente de prendre le controle (bouton « Actualiser »). */
export function activatePendingUpdate(): void {
  waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

/**
 * Ecoute `beforeinstallprompt` pour piloter un bouton d'installation
 * personnalise plutot que le mini-infobar par defaut du navigateur.
 * Retourne une fonction de nettoyage.
 */
export function watchInstallPrompt(onAvailabilityChange: (available: boolean) => void): () => void {
  const handleBeforeInstallPrompt = (event: Event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    onAvailabilityChange(true);
  };
  const handleAppInstalled = () => {
    deferredInstallPrompt = null;
    onAvailabilityChange(false);
  };
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.removeEventListener('appinstalled', handleAppInstalled);
  };
}

/** Declenche le prompt natif d'installation. `false` si aucun prompt en attente ou refuse. */
export async function promptInstall(): Promise<boolean> {
  if (deferredInstallPrompt === null) {
    return false;
  }
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome === 'accepted';
}

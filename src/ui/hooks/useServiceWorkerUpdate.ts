import { useEffect, useState } from 'react';
import { activatePendingUpdate, registerServiceWorker } from '../../pwa/install';

export interface ServiceWorkerUpdateState {
  readonly updateAvailable: boolean;
  readonly applyUpdate: () => void;
}

/** Enregistre le service worker une fois et expose le bandeau de mise a jour. */
export function useServiceWorkerUpdate(): ServiceWorkerUpdateState {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    registerServiceWorker(() => setUpdateAvailable(true));
  }, []);

  return { updateAvailable, applyUpdate: activatePendingUpdate };
}

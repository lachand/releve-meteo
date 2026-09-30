import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './install';

/*
 * Les navigateurs qui refusent le service worker (Firefox en navigation
 * privee, contexte non securise, blocage par une politique) font echouer
 * `register()`, ou ne rendent aucune inscription : l'application doit
 * rester silencieuse et fonctionner sans, jamais lever un rejet non
 * gere dans la console.
 */

/** `process` n'est pas type ici (pas de types Node) : seul l'ecouteur de rejets sert. */
const nodeProcess = (
  globalThis as unknown as {
    process: {
      on(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
      off(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
    };
  }
).process;

function stubServiceWorker(register: () => Promise<unknown>) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register, controller: null, addEventListener: vi.fn() },
  });
}

/** Laisse les promesses en attente se resoudre, rejets compris. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('registerServiceWorker', () => {
  it('reste silencieux quand le navigateur refuse l inscription', async () => {
    vi.stubEnv('VITE_SW', '1');
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    nodeProcess.on('unhandledRejection', onRejection);
    const onUpdateAvailable = vi.fn();
    stubServiceWorker(() => Promise.reject(new DOMException('refuse', 'SecurityError')));
    registerServiceWorker(onUpdateAvailable);
    await flush();
    nodeProcess.off('unhandledRejection', onRejection);
    expect(rejections).toEqual([]);
    expect(onUpdateAvailable).not.toHaveBeenCalled();
  });

  it('reste silencieux quand l inscription ne rend rien', async () => {
    vi.stubEnv('VITE_SW', '1');
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    nodeProcess.on('unhandledRejection', onRejection);
    stubServiceWorker(() => Promise.resolve(undefined));
    registerServiceWorker(vi.fn());
    await flush();
    nodeProcess.off('unhandledRejection', onRejection);
    expect(rejections).toEqual([]);
  });
});

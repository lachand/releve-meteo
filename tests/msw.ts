import { cleanup } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { pendingCount } from '../src/data/queue';

// Handler de secours, conserve par `resetHandlers` : la strategie
// `onUnhandledRequest: 'error'` de MSW 2.15 n'empeche pas la requete de
// partir (elle recoit la vraie reponse du serveur). Toute requete non
// simulee echoue donc ici, bruyamment, sans jamais toucher le reseau.
const refuseUnmocked = http.all('*', ({ request }) => {
  console.error(`[tests/msw] requete non simulee refusee : ${request.method} ${request.url}`);
  return HttpResponse.error();
});

export const server = setupServer(refuseUnmocked);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(async () => {
  // Demonter avant de reinitialiser : les hooks s'executent en pile, et une
  // vue encore montee lancait des requetes hors de tout test, que le test
  // suivant recuperait via la file de deduplication (`enqueue`).
  cleanup();
  await vi
    .waitFor(
      () => {
        if (pendingCount() > 0) {
          throw new Error('taches de donnees encore en vol');
        }
      },
      { timeout: 3000, interval: 10 },
    )
    .catch(() => undefined);
  server.resetHandlers();
});
afterAll(() => server.close());

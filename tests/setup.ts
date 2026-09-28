import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetStationDownloadsForTests } from '../src/data/clients/meteostat';

// Les vues chargees a la demande (React.lazy) peuvent mettre plus d'une
// seconde a apparaitre quand toute la suite tourne en parallele.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  // Un telechargement partage ne doit jamais fuir d'un test a l'autre.
  resetStationDownloadsForTests();
});

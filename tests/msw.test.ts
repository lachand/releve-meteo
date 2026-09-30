import { describe, expect, it } from 'vitest';
import './msw';

// Une requete sans handler part sur le vrai reseau (strategie `bypass` de
// fait pendant l'intervalle entre deux tests) : un test de vue recevait alors
// un fichier de station reel au lieu de la fixture, selon l'heure du jour.
describe('serveur de test', () => {
  it('ne laisse jamais partir une requete sans handler vers le reseau reel', async () => {
    await expect(fetch('https://data.meteostat.net/hourly/2026/07480.csv.gz')).rejects.toThrow();
  });
});

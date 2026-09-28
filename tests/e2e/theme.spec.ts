import { stubApis } from './apiStub';
import { expect, openLyon, test } from './fixtures';

test('theme sombre : le releve de Lyon s affiche sans erreur console', async ({ page }) => {
  // L emulation doit preceder la navigation : le theme "auto" (par defaut,
  // localStorage vierge dans un nouveau contexte de test) suit uniquement
  // `prefers-color-scheme` (useAppliedTheme.ts, styles/tokens.css).
  await page.emulateMedia({ colorScheme: 'dark' });

  // Message generique que Chromium journalise lui-meme quand une image en
  // cours de reception est coupee (par exemple une tuile de carte dont le
  // conteneur est retire au changement d onglet) : ni un appel console.error
  // de l application, ni signe d une vraie erreur reseau (la requete a bien
  // ete bouchonnee, cf. tests/e2e/tileStub.ts). Exclusion precise, par texte
  // exact, pour continuer a detecter toute autre erreur.
  const BENIGN_CANCELLED_RESOURCE = 'Failed to load resource: net::ERR_FAILED';
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text() !== BENIGN_CANCELLED_RESOURCE) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(String(error));
  });

  await stubApis(page);
  await openLyon(page);

  // Parcourt chaque onglet : c est la ou les graphiques Chart.js et la
  // carte Leaflet, les plus susceptibles de lire des variables CSS de
  // theme au montage, s initialisent reellement.
  const tabs = page.getByRole('tab');
  const count = await tabs.count();
  for (let i = 0; i < count; i += 1) {
    await tabs.nth(i).click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
    // Laisse chaque onglet finir ses requetes (carte : tuiles OSM et
    // RainViewer) avant de passer au suivant. Sans cette attente, quitter
    // l onglet Radar pendant qu une tuile est en cours de reception coupe
    // la reponse et Chromium journalise "Failed to load resource" meme si
    // la requete etait bien bouchonnee : bruit de navigation, pas une
    // erreur applicative.
    await page.waitForLoadState('networkidle');
  }

  expect(errors).toEqual([]);
});

import { LYON_URL, stubApis } from './apiStub';
import { expect, test } from './fixtures';

// Regression visuelle (TESTING.md 6) : trois vues, en clair et en sombre, au
// profil large (chromium) et a 380 px (mobile-380). Horloge figee et API
// simulees par `stubApis` : seul un changement de rendu fait echouer. Les
// captures de reference sont propres a chaque projet et a chaque plateforme ;
// Firefox et WebKit rendent le texte autrement et n'en ont pas. Pour les
// mettre a jour apres un changement voulu :
//   npx playwright test tests/e2e/visual.spec.ts --update-snapshots
const VIEWS = [
  { key: 'jour', name: 'aujourdhui' },
  { key: 'modeles', name: 'modeles' },
  { key: 'fiabilite', name: 'fiabilite' },
] as const;

for (const colorScheme of ['light', 'dark'] as const) {
  for (const view of VIEWS) {
    test(`capture : ${view.name}, theme ${colorScheme}`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'References de rendu : Chromium seulement');
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await stubApis(page);
      await page.goto(view.key === 'jour' ? LYON_URL : `${LYON_URL}&vue=${view.key}`);
      // Signe que la vue est chargee : les donnees propres a chaque onglet.
      const ready =
        view.key === 'fiabilite'
          ? page.getByRole('table', { name: /Erreur absolue moyenne.*Température/ })
          : page.getByText('Modèle retenu', { exact: true });
      await expect(ready.first()).toBeVisible({ timeout: 15000 });
      await page.waitForLoadState('networkidle');
      // Polices chargees et graphiques dessines avant la prise de vue.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(800);

      await expect(page).toHaveScreenshot(`${view.name}-${colorScheme}.png`, {
        animations: 'disabled',
        maxDiffPixelRatio: 0.02,
      });
    });
  }
}

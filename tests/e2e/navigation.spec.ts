import { LYON_URL, stubApis } from './apiStub';
import { expect, openLyon, tabByLabel, test } from './fixtures';

test('navigation entre onglets a la souris et au clavier, reflete dans l URL', async ({ page }) => {
  await stubApis(page);
  await openLyon(page);

  const tablist = page.getByRole('tablist', { name: 'Sections du relevé' });
  await expect(tablist).toBeVisible();
  // Onglet actif par defaut : le premier de la liste (vue "jour"), jamais
  // ajoute a l URL (App.tsx : `sharedPlaceSearch(place, view === 'jour' ? undefined : view)`).
  await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
  expect(new URL(page.url()).searchParams.has('vue')).toBe(false);

  // Souris.
  const daysTab = tabByLabel(page, '15 jours');
  await daysTab.click();
  await expect(daysTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected', 'false');
  await expect(page).toHaveURL(/vue=jours/);

  // Clavier : fleche droite, motif ARIA des onglets (activation automatique).
  await page.keyboard.press('ArrowRight');
  const radarTab = tabByLabel(page, 'Radar');
  await expect(radarTab).toHaveAttribute('aria-selected', 'true');
  await expect(daysTab).toHaveAttribute('aria-selected', 'false');
  await expect(page).toHaveURL(/vue=carte/);

  await page.keyboard.press('ArrowRight');
  const modelsTab = tabByLabel(page, 'Modèles');
  await expect(modelsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/vue=modeles/);
});

test('l URL partagee ouvre directement le releve, sans recherche', async ({ page }) => {
  await stubApis(page);
  await page.goto(LYON_URL);

  await expect(page.getByRole('heading', { level: 1, name: 'Lyon' })).toBeVisible();
  await expect(page.getByText('Modèle retenu')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-model]').first()).toContainText('AROME');
});

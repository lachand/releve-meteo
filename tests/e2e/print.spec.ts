import { stubApis } from './apiStub';
import { expect, openLyon, test } from './fixtures';

// Feuille de registre : a l'impression, les commandes disparaissent mais la
// provenance reste (mention de la feuille, sources et licences en pied).
test("l'impression garde la provenance et retire les commandes", async ({ page }) => {
  await stubApis(page);
  await openLyon(page);
  await expect(page.getByText('Modèle retenu', { exact: true })).toBeVisible({ timeout: 15000 });

  const sheet = page.getByText(/Feuille de registre, imprimée le/);
  const print = page.getByRole('button', { name: 'Imprimer le relevé' });
  const footer = page.getByRole('contentinfo');

  await expect(print).toBeVisible();
  await expect(sheet).toBeHidden();

  await page.emulateMedia({ media: 'print' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('jamais des mesures');
  await expect(print).toBeHidden();
  await expect(page.getByRole('tablist', { name: 'Sections du relevé' })).toBeHidden();
  await expect(footer).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Lyon' })).toBeVisible();
});

// Les feuillets repliables (air, repères du jour, alertes...) s'ouvrent a
// l'impression : la feuille de registre ne cache rien. `emulateMedia` ne
// declenche pas `beforeprint`, que le navigateur envoie avant d'imprimer.
test("l'impression ouvre les feuillets replies, puis les referme", async ({ page }) => {
  await stubApis(page);
  await openLyon(page);
  await expect(page.getByText('Modèle retenu', { exact: true })).toBeVisible({ timeout: 15000 });

  const airDetails = page
    .getByRole('heading', { name: 'Qualité de l’air et pollens' })
    .locator('xpath=ancestor::details');
  await expect(airDetails).not.toHaveAttribute('open', '');

  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(airDetails).toHaveAttribute('open', '');

  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(airDetails).not.toHaveAttribute('open', '');
});

// Onglet Cartes : la carte, sa legende, son image radar horodatee et leurs
// attributions s'impriment ; ni les commandes de zoom ni de lecture.
test("l'impression des cartes garde la legende et l'attribution, sans les commandes", async ({
  page,
}) => {
  await stubApis(page);
  await openLyon(page);
  await page.getByRole('tab', { name: 'Cartes' }).click();
  const radar = page.getByRole('heading', { name: 'Pluie observée, deux dernières heures' });
  await expect(radar).toBeVisible({ timeout: 15000 });
  const zoom = page.locator('.leaflet-control-zoom').first();
  const attribution = page.locator('.leaflet-control-attribution').first();
  await expect(zoom).toBeVisible();
  await expect(attribution).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  await expect(zoom).toBeHidden();
  await expect(page.locator('.leaflet-control-zoom:visible')).toHaveCount(0);
  await expect(attribution).toBeVisible();
  await expect(radar).toBeVisible();
  // La carte garde une hauteur fixe de feuille, sans deborder de la page.
  const box = await page.locator('.leaflet-container').first().boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(200);
});

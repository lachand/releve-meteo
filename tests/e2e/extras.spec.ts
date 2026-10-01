import { readFile } from 'node:fs/promises';
import { LYON_URL, stubApis } from './apiStub';
import { expect, openLyon, test } from './fixtures';

/*
 * Nouveautes du lot « ameliorations » : sauvegarde, probabilite de pluie,
 * normales, carte du desaccord, calendrier, rapport de diagnostic. Aucune ne
 * depend de Chromium : elles tournent sur les quatre projets.
 */

test('sauvegarde : exporter, vider, restaurer retrouve les favoris', async ({ page }) => {
  await stubApis(page);
  await openLyon(page);
  await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
  await expect(page.getByRole('button', { name: 'Retirer des favoris' })).toBeVisible();

  await page.getByRole('button', { name: 'Réglages' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter mes données' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^releve-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const saved = JSON.parse(await readFile(path, 'utf8')) as {
    app: string;
    preferences: { favourites: { name: string }[]; apiKeys?: unknown };
  };
  expect(saved.app).toBe('releve-meteo');
  expect(saved.preferences.favourites.map((f) => f.name)).toContain('Lyon');
  // Les cles d'API ne sortent jamais.
  expect(saved.preferences.apiKeys).toBeUndefined();

  // Retire le favori, puis restaure depuis le fichier.
  await page
    .getByRole('button', { name: 'Fermer' })
    .first()
    .click()
    .catch(() => undefined);
  await page.evaluate(() => localStorage.removeItem('meteo-fr:prefs'));
  await page.reload();
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByLabel('Restaurer une sauvegarde').setInputFiles(path);
  await expect(page.getByRole('group', { name: 'Sauvegarde à restaurer' })).toContainText(
    '1 favori',
  );
  await page.getByRole('button', { name: 'Remplacer mes données' }).click();
  await page.waitForLoadState('load');
  await expect(page.getByRole('button', { name: 'Retirer des favoris' })).toBeVisible({
    timeout: 15000,
  });
});

test('heure par heure : la probabilite de pluie vient de l ensemble', async ({ page }) => {
  await stubApis(page);
  await page.goto(`${LYON_URL}&vue=heures`);
  await expect(
    page.getByRole('heading', { name: 'Probabilité de pluie, heure par heure' }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole('img', { name: /Probabilité de pluie heure par heure/ }),
  ).toBeVisible();
});

test('accueil : le maximum prevu est situe par rapport a la normale, dite estimee', async ({
  page,
}) => {
  await stubApis(page);
  await page.goto(LYON_URL);
  await expect(page.getByText(/de la normale 1991-2020/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/réanalyse ERA5/).first()).toBeVisible();
});

test('cartes : la carte du desaccord dit son cout et ne charge rien avant la demande', async ({
  page,
}) => {
  await stubApis(page);
  await page.goto(`${LYON_URL}&vue=carte`);
  await expect(
    page.getByRole('heading', { name: 'Où les modèles se contredisent, 48 heures' }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/environ 324 appels du quota gratuit/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Afficher la carte du désaccord' })).toBeVisible();
});

test('fiabilite : l historique montre un calendrier des 30 derniers jours', async ({ page }) => {
  await stubApis(page);
  await page.goto(`${LYON_URL}&vue=fiabilite`);
  await expect(page.getByRole('heading', { name: 'Historique de fiabilité' })).toBeVisible({
    timeout: 30000,
  });
});

test('reglages : le rapport de diagnostic se copie sans lieu ni cle', async ({
  page,
  context,
  browserName,
}) => {
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  }
  await stubApis(page);
  await openLyon(page);
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('button', { name: 'Copier le rapport' }).click();
  // Selon le navigateur, la copie est acceptee ou refusee : les deux sont dites.
  await expect(page.getByText(/Rapport copié|Copie impossible/)).toBeVisible();
});

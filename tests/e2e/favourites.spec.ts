import { stubApis } from './apiStub';
import { expect, openLyon, test } from './fixtures';

test('ajouter Lyon aux favoris, recharger, le lieu reste dans la bascule (TESTING.md 5.2)', async ({
  page,
}) => {
  await stubApis(page);
  await openLyon(page);

  await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
  await expect(page.getByRole('button', { name: 'Retirer des favoris' })).toBeVisible();

  // Le lieu est deja porte par l URL (App.tsx ecrit `?lat=&lon=&nom=...` a
  // chaque changement de lieu) : un rechargement le rouvre sans nouvelle
  // recherche, et les favoris persistes en localStorage doivent le lister.
  await page.reload();
  await expect(page.getByText('Modèle retenu')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Retirer des favoris' })).toBeVisible();

  const switcher = page.getByRole('navigation', { name: 'Lieux favoris' });
  await expect(switcher.getByRole('button', { name: 'Lyon', exact: true })).toBeVisible();
});

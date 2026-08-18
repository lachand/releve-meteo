import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// "Virieu" et non "Val de Virieu" : voir forecast.spec.ts et BACKLOG.md
// "Ecarts constates" pour la raison. "Virieu" seul (sans exact:true) matche
// aussi "Virieu-le-Grand" (Ain, premier resultat de la geocodification
// reelle) : le libelle complet "Virieu, Isere" est necessaire pour cibler
// la bonne commune de facon fiable.
async function selectPlace(page: Page, query: string, resultLabel: string): Promise<void> {
  await page.getByLabel('Chercher une commune').fill(query);
  await page.getByRole('button', { name: resultLabel, exact: true }).click();
  await expect(page.getByText(/°C/).first()).toBeVisible({ timeout: 15000 });
}

test('ajouter un favori, recharger, le favori est la (TESTING.md 5.2)', async ({ page }) => {
  await page.goto('/');
  await selectPlace(page, 'Virieu', 'Virieu, Isère');

  await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
  await expect(page.getByRole('button', { name: 'Virieu', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Virieu', exact: true })).toBeVisible();
});

test('ajouter un deuxieme lieu, reordonner, recharger, l ordre tient (TESTING.md 5.3)', async ({
  page,
}) => {
  await page.goto('/');
  await selectPlace(page, 'Virieu', 'Virieu, Isère');
  await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();

  await selectPlace(page, 'Grenoble', 'Grenoble, Isère');
  await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();

  const items = page.locator('nav[aria-label="Lieux favoris"] li');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('Virieu');

  await items
    .first()
    .getByRole('button', { name: /Deplacer .* vers le bas/ })
    .click();
  await expect(items.first()).toContainText('Grenoble');

  await page.reload();
  await expect(page.locator('nav[aria-label="Lieux favoris"] li').first()).toContainText(
    'Grenoble',
  );
});

test('URL partagee ?lat=&lon= charge le bon lieu et le classe cotier (TESTING.md 5.5)', async ({
  page,
}) => {
  // Vannes, tete du Golfe du Morbihan : voir BACKLOG.md "Ecarts constates"
  // du 2026-08-18, les coordonnees litterales de TESTING.md 5.5 tombent en
  // pleine eau et sont hors du polygone metropolitain embarque.
  await page.goto('/?lat=47.6559&lon=-2.7603');

  await expect(page.getByText(/°C/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/côtier/)).toBeVisible();
});

test('modifier une preference d unite, elle s applique et persiste (TESTING.md 5.8)', async ({
  page,
}) => {
  await page.goto('/');
  await selectPlace(page, 'Virieu', 'Virieu, Isère');

  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByLabel('Vitesse du vent').selectOption('kt');
  await page.getByRole('button', { name: 'Fermer' }).click();

  await expect(page.getByText(/kt$/).first()).toBeVisible();

  await page.reload();
  await selectPlace(page, 'Virieu', 'Virieu, Isère');
  await expect(page.getByText(/kt$/).first()).toBeVisible();
});

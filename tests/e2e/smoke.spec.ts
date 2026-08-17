import { test, expect } from '@playwright/test';

test('la page se charge et affiche le nom du produit', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Relevé', { exact: true })).toBeVisible();
});

test('la page Sources et licences est accessible', async ({ page }) => {
  await page.goto('/sources.html');
  await expect(page.getByRole('heading', { name: 'Sources et licences' })).toBeVisible();
});

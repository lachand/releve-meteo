import { test, expect } from '@playwright/test';
import { stubTileRequests } from './tileStub';

test('recherche Virieu, la prevision affiche le badge du modele actif', async ({ page }) => {
  // La geocodification Open-Meteo ne resout pas "Val de Virieu" verbatim
  // (verifie en direct le 17/08/2026, cf. BACKLOG.md "Ecarts constates") :
  // seul "Virieu" retourne la commune.
  await stubTileRequests(page);
  await page.goto('/');
  await page.getByLabel('Chercher une commune').fill('Virieu');
  await page
    .getByRole('button', { name: /Virieu/ })
    .first()
    .click();

  await expect(page.getByRole('heading', { name: /Virieu/ })).toBeVisible();
  await expect(page.getByText(/°C/).first()).toBeVisible({ timeout: 15000 });
  const modelBadge = page.getByText(/AROME|ARPEGE|ICON-EU|GFS/).first();
  await expect(modelBadge).toBeVisible();
});
